package expo.modules.t3ssh

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit
import org.json.JSONObject

private const val EVENT_TUNNEL_STATE = "onTunnelState"
private const val WATCHDOG_INTERVAL_SECONDS = 5L

private fun daemonThreadFactory(name: String) = ThreadFactory { runnable ->
  Thread(runnable, name).apply { isDaemon = true }
}

/**
 * Owns the single SSH session behind a serialized job queue. Connects for the same profile
 * coalesce onto the in-flight job; a connect for a different profile or an explicit disconnect
 * supersedes it, and a superseded attempt always closes whatever session it just opened so a
 * stale completion can never resurrect a tunnel.
 */
class T3SshModule : Module() {
  private val client = TunnelClient()
  private val stateLock = Any()
  private val executor = Executors.newSingleThreadExecutor(daemonThreadFactory("t3-ssh-jobs"))
  private val watchdog: ScheduledExecutorService =
    Executors.newSingleThreadScheduledExecutor(daemonThreadFactory("t3-ssh-watchdog"))

  private class ConnectJob(val configJson: String, val generation: Int) {
    val promises = mutableListOf<Promise>()
  }

  private var currentJob: ConnectJob? = null
  private var queuedJob: ConnectJob? = null
  private var generation = 0
  private var expectConnected = false

  override fun definition() = ModuleDefinition {
    Name("T3Ssh")

    Events(EVENT_TUNNEL_STATE)

    OnCreate {
      startWatchdog()
    }

    OnDestroy {
      shutdown()
    }

    AsyncFunction("connect") { configJson: String, promise: Promise ->
      enqueueConnect(configJson, promise)
    }

    AsyncFunction("disconnect") { promise: Promise ->
      enqueueDisconnect(promise)
    }

    AsyncFunction("readBundledEnrollment") {
      val context = appContext.reactContext
        ?: throw TunnelClient.TunnelException(TunnelClient.ErrorCategory.CONFIG, "App not ready.")
      try {
        context.assets.open("private/t3-enrollment.json").bufferedReader().use { it.readText() }
      } catch (_: java.io.FileNotFoundException) {
        null
      }
    }

    Function("isConnected") {
      client.isConnected()
    }
  }

  private fun startWatchdog() {
    watchdog.scheduleWithFixedDelay(
      {
        val dropped = synchronized(stateLock) { expectConnected && !client.isConnected() }
        if (dropped) {
          synchronized(stateLock) { expectConnected = false }
          sendEvent(EVENT_TUNNEL_STATE, mapOf("type" to "dropped"))
        }
      },
      WATCHDOG_INTERVAL_SECONDS,
      WATCHDOG_INTERVAL_SECONDS,
      TimeUnit.SECONDS
    )
  }

  private fun shutdown() {
    watchdog.shutdownNow()
    executor.shutdownNow()
    val abandoned = synchronized(stateLock) {
      generation++
      expectConnected = false
      val jobs = listOfNotNull(currentJob, queuedJob)
      currentJob = null
      queuedJob = null
      jobs
    }
    for (job in abandoned) rejectAll(job, cancelledError())
    // A socket handshake may hold the client monitor until its timeout. Never wait for that
    // monitor on the module's lifecycle thread during app teardown.
    daemonThreadFactory("t3-ssh-cleanup").newThread { client.disconnect() }.start()
  }

  private fun enqueueConnect(configJson: String, promise: Promise) {
    val parseError = try {
      parseConfig(configJson)
      null
    } catch (error: TunnelClient.TunnelException) {
      error
    }
    if (parseError != null) {
      promise.reject(parseError)
      return
    }
    synchronized(stateLock) {
      val current = currentJob
      if (current != null && current.configJson == configJson &&
          current.generation == generation && queuedJob == null) {
        current.promises.add(promise)
        return@synchronized
      }
      val queued = queuedJob
      if (queued != null) {
        if (queued.configJson == configJson) {
          queued.promises.add(promise)
        } else {
          rejectAll(queued, cancelledError())
          queuedJob = ConnectJob(configJson, ++generation).also { it.promises.add(promise) }
        }
        return@synchronized
      }
      // A different profile supersedes the in-flight attempt; its completion is now stale.
      queuedJob = ConnectJob(configJson, ++generation).also { it.promises.add(promise) }
      scheduleNextLocked()
    }
  }

  private fun enqueueDisconnect(promise: Promise) {
    val abandoned = synchronized(stateLock) {
      generation++
      expectConnected = false
      val jobs = listOfNotNull(currentJob, queuedJob)
      currentJob = null
      queuedJob = null
      jobs
    }
    for (job in abandoned) rejectAll(job, cancelledError())
    executor.execute {
      client.disconnect()
      promise.resolve(null)
    }
  }

  private fun scheduleNextLocked() {
    if (currentJob != null) return
    val next = queuedJob ?: return
    queuedJob = null
    currentJob = next
    executor.execute { runJob(next) }
  }

  @Suppress("TooGenericExceptionCaught") // Failures reach JS as categorized rejections.
  private fun runJob(job: ConnectJob) {
    val failure: TunnelClient.TunnelException? = try {
      client.connect(parseConfig(job.configJson))
      null
    } catch (error: TunnelClient.TunnelException) {
      error
    } catch (error: Throwable) {
      TunnelClient.categorize(error)
    }
    synchronized(stateLock) {
      if (currentJob === job) currentJob = null
      if (job.generation != generation) {
        // Superseded while connecting: never leave its session running.
        client.disconnect()
        rejectAll(job, cancelledError())
      } else if (failure == null) {
        expectConnected = true
        resolveAll(job)
      } else {
        expectConnected = false
        rejectAll(job, failure)
      }
      scheduleNextLocked()
    }
  }

  private fun resolveAll(job: ConnectJob) {
    val promises = job.promises.toList()
    job.promises.clear()
    for (promise in promises) promise.resolve(null)
  }

  private fun rejectAll(job: ConnectJob, error: TunnelClient.TunnelException) {
    val promises = job.promises.toList()
    job.promises.clear()
    for (promise in promises) promise.reject(error)
  }

  private fun cancelledError() =
    TunnelClient.TunnelException(TunnelClient.ErrorCategory.CANCELLED, "Connection cancelled.")

  @Suppress("TooGenericExceptionCaught") // Any malformed JSON is the same CONFIG rejection.
  private fun parseConfig(configJson: String): TunnelClient.Config {
    val json = try {
      JSONObject(configJson)
    } catch (error: Exception) {
      throw TunnelClient.TunnelException(TunnelClient.ErrorCategory.CONFIG, "Invalid SSH profile.")
    }
    return TunnelClient.Config(
      json.optString("host", ""),
      json.optInt("port", 22),
      json.optString("username", ""),
      json.optString("hostKey", ""),
      json.optString("privateKey", ""),
      json.optInt("connectTimeoutMs", TunnelClient.DEFAULT_CONNECT_TIMEOUT_MS)
    )
  }
}

private fun Promise.reject(error: TunnelClient.TunnelException) {
  // Only the category and its fixed message cross the bridge; the cause stays native so no
  // profile material or socket detail can leak into JS state or logs.
  reject(error.category.name, error.message, null)
}
