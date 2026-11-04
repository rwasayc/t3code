package expo.modules.t3ssh;

import com.jcraft.jsch.HostKey;
import com.jcraft.jsch.HostKeyRepository;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchChangedHostKeyException;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.JSchUnknownHostKeyException;
import com.jcraft.jsch.Logger;
import com.jcraft.jsch.Session;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.NoRouteToHostException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Plain-Java SSH local port forward to a T3 Code server behind a reverse tunnel. No Android
 * imports so it can run as a JVM integration test against a real SSH server.
 *
 * <p>Security contract: publickey auth only, the server's ssh-ed25519 host key must match the
 * pinned key byte for byte (no interactive fallback), and the forward is bound to loopback on
 * both ends. Error messages are fixed per category and never carry profile material.
 */
public final class TunnelClient {
  public static final String LOCAL_BIND = "127.0.0.1";
  public static final int LOCAL_PORT = 37730;
  public static final String REMOTE_BIND = "127.0.0.1";
  public static final int REMOTE_PORT = 13773;
  public static final String UPSTREAM_HEALTH_URL =
      "http://127.0.0.1:37730/.well-known/t3/environment";

  public static final int DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
  private static final int HEALTH_TIMEOUT_MS = 8_000;
  private static final int HEALTH_BODY_LIMIT = 64 * 1024;
  private static final int SERVER_ALIVE_INTERVAL_MS = 10_000;
  private static final int SERVER_ALIVE_COUNT_MAX = 3;
  private static final String HOST_KEY_ALGORITHM = "ssh-ed25519";
  /** uint32 length prefix + "ssh-ed25519" + uint32 length prefix + 32-byte public key. */
  private static final int ED25519_WIRE_KEY_LENGTH = 4 + 11 + 4 + 32;

  public enum ErrorCategory {
    CONFIG,
    AUTH,
    HOST_KEY,
    NETWORK,
    TIMEOUT,
    UPSTREAM,
    CANCELLED,
    UNKNOWN,
  }

  public static final class TunnelException extends Exception {
    private final ErrorCategory category;

    public TunnelException(ErrorCategory category, String safeMessage) {
      super(safeMessage);
      this.category = category;
    }

    public TunnelException(ErrorCategory category, String safeMessage, Throwable cause) {
      super(safeMessage, cause);
      this.category = category;
    }

    public ErrorCategory getCategory() {
      return category;
    }
  }

  public static final class Config {
    public final String host;
    public final int port;
    public final String username;
    public final String hostKey;
    public final String privateKeyPem;
    public final int connectTimeoutMs;
    final byte[] pinnedHostKey;

    public Config(
        String host,
        int port,
        String username,
        String hostKey,
        String privateKeyPem,
        int connectTimeoutMs)
        throws TunnelException {
      if (host == null || host.trim().isEmpty() || host.length() > 253 || containsWhitespace(host)) {
        throw new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.");
      }
      if (port < 1 || port > 65535) {
        throw new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.");
      }
      if (username == null || username.trim().isEmpty() || username.length() > 64) {
        throw new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.");
      }
      this.host = host.trim();
      this.port = port;
      this.username = username.trim();
      this.hostKey = hostKey;
      this.pinnedHostKey = parsePinnedHostKey(hostKey);
      if (privateKeyPem == null
          || !privateKeyPem.contains("-----BEGIN")
          || !privateKeyPem.contains("PRIVATE KEY-----")
          || privateKeyPem.length() > 16 * 1024) {
        throw new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.");
      }
      this.privateKeyPem = privateKeyPem;
      this.connectTimeoutMs =
          connectTimeoutMs > 0 ? connectTimeoutMs : DEFAULT_CONNECT_TIMEOUT_MS;
    }

    private static boolean containsWhitespace(String value) {
      for (int i = 0; i < value.length(); i++) {
        if (Character.isWhitespace(value.charAt(i))) return true;
      }
      return false;
    }

    /** Parses "ssh-ed25519 &lt;base64&gt;" and sanity-checks the SSH wire encoding. */
    static byte[] parsePinnedHostKey(String hostKey) throws TunnelException {
      TunnelException invalid = new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.");
      if (hostKey == null) throw invalid;
      String trimmed = hostKey.trim();
      if (!trimmed.startsWith(HOST_KEY_ALGORITHM + " ")) throw invalid;
      String encoded = trimmed.substring(HOST_KEY_ALGORITHM.length() + 1).trim();
      // java.util.Base64 needs API 26 and the project targets 24; this decoder covers both.
      if (encoded.isEmpty() || encoded.length() > 256) throw invalid;
      byte[] decoded = decodeBase64(encoded);
      if (decoded == null || decoded.length != ED25519_WIRE_KEY_LENGTH) throw invalid;
      if (decoded[0] != 0 || decoded[1] != 0 || decoded[2] != 0 || decoded[3] != 11
          || decoded[15] != 0 || decoded[16] != 0 || decoded[17] != 0 || decoded[18] != 32) {
        throw invalid;
      }
      byte[] algorithm = HOST_KEY_ALGORITHM.getBytes(StandardCharsets.UTF_8);
      for (int i = 0; i < algorithm.length; i++) {
        if (decoded[4 + i] != algorithm[i]) throw invalid;
      }
      return decoded;
    }

    private static byte[] decodeBase64(String encoded) {
      if (encoded.length() % 4 != 0) return null;
      ByteArrayOutputStream out = new ByteArrayOutputStream(encoded.length() * 3 / 4);
      for (int i = 0; i < encoded.length(); i += 4) {
        int block = 0;
        int padding = 0;
        for (int offset = 0; offset < 4; offset++) {
          char c = encoded.charAt(i + offset);
          if (c == '=') {
            padding++;
            block <<= 6;
            continue;
          }
          if (padding > 0) return null;
          int digit = base64Digit(c);
          if (digit < 0) return null;
          block = (block << 6) | digit;
        }
        out.write((block >> 16) & 0xff);
        if (padding < 2) out.write((block >> 8) & 0xff);
        if (padding < 1) out.write(block & 0xff);
      }
      return out.toByteArray();
    }

    private static int base64Digit(char c) {
      if (c >= 'A' && c <= 'Z') return c - 'A';
      if (c >= 'a' && c <= 'z') return c - 'a' + 26;
      if (c >= '0' && c <= '9') return c - '0' + 52;
      if (c == '+') return 62;
      if (c == '/') return 63;
      return -1;
    }
  }

  /**
   * Answers OK only when the presented key is byte-identical to the pinned one. Every other
   * outcome is CHANGED, which with StrictHostKeyChecking=yes aborts the handshake; nothing is
   * ever added or forgotten, so there is no trust-on-first-use path.
   */
  static final class PinnedHostKeyRepository implements HostKeyRepository {
    private final byte[] pinnedKey;

    PinnedHostKeyRepository(byte[] pinnedKey) {
      this.pinnedKey = pinnedKey;
    }

    @Override
    public int check(String host, byte[] key) {
      return MessageDigest.isEqual(pinnedKey, key) ? OK : CHANGED;
    }

    @Override
    public void add(HostKey hostkey, com.jcraft.jsch.UserInfo ui) {}

    @Override
    public void remove(String host, String type) {}

    @Override
    public void remove(String host, String type, byte[] key) {}

    @Override
    public String getKnownHostsRepositoryID() {
      return "t3-pinned-host-key";
    }

    @Override
    public HostKey[] getHostKey() {
      return new HostKey[0];
    }

    @Override
    public HostKey[] getHostKey(String host, String type) {
      return new HostKey[0];
    }
  }

  private static final AtomicBoolean JSCH_CONFIGURED = new AtomicBoolean(false);

  static void configureJSch() {
    if (!JSCH_CONFIGURED.compareAndSet(false, true)) return;
    // The jar's JCE EdDSA classes are multi-release (Java 15+) and missing on Android;
    // the Bouncy Castle lightweight implementations work everywhere bcprov does.
    JSch.setConfig("xdh", "com.jcraft.jsch.bc.XDH");
    JSch.setConfig("ssh-ed25519", "com.jcraft.jsch.bc.SignatureEd25519");
    JSch.setConfig("ssh-ed448", "com.jcraft.jsch.bc.SignatureEd448");
    JSch.setConfig("keypairgen.eddsa", "com.jcraft.jsch.bc.KeyPairGenEdDSA");
    // Never ship tunnel chatter (hosts, fingerprints) to logcat.
    JSch.setLogger(
        new Logger() {
          @Override
          public boolean isEnabled(int level) {
            return false;
          }

          @Override
          public void log(int level, String message) {}
        });
  }

  private volatile Session session;
  private Config sessionConfig;

  private static boolean sameConnection(Config left, Config right) {
    return left != null && left.port == right.port && left.host.equals(right.host)
        && left.username.equals(right.username)
        && left.privateKeyPem.equals(right.privateKeyPem)
        && MessageDigest.isEqual(left.pinnedHostKey, right.pinnedHostKey);
  }

  public TunnelClient() {
    configureJSch();
  }

  /**
   * Connects, pins the forward, and verifies the upstream T3 server answers. Safe to call when
   * already connected: a healthy session is kept, a stale one is replaced. Any failure leaves
   * no session behind.
   */
  public synchronized void connect(Config config) throws TunnelException {
    if (session != null && session.isConnected()) {
      if (sameConnection(sessionConfig, config) && isUpstreamHealthy()) return;
      closeSession();
    } else {
      closeSession();
    }
    try {
      session = openSession(config);
      bindForwardWithRetry(session);
      assertUpstreamHealthy();
      sessionConfig = config;
    } catch (TunnelException e) {
      closeSession();
      throw e;
    } catch (Throwable e) {
      closeSession();
      throw categorize(e);
    }
  }

  public synchronized void disconnect() {
    closeSession();
  }

  public boolean isConnected() {
    Session current = session;
    return current != null && current.isConnected();
  }

  private void closeSession() {
    Session current = session;
    session = null;
    sessionConfig = null;
    if (current != null) {
      try {
        current.disconnect();
      } catch (Throwable ignored) {
      }
    }
  }

  private Session openSession(Config config) throws TunnelException {
    final JSch jsch = new JSch();
    try {
      jsch.addIdentity("t3-tunnel", config.privateKeyPem.getBytes(StandardCharsets.UTF_8), null, null);
    } catch (JSchException e) {
      throw new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.", e);
    }
    Session next = null;
    boolean ready = false;
    try {
      next = jsch.getSession(config.username, config.host, config.port);
      next.setConfig("PreferredAuthentications", "publickey");
      next.setConfig("StrictHostKeyChecking", "yes");
      next.setConfig("server_host_key", HOST_KEY_ALGORITHM);
      next.setHostKeyRepository(new PinnedHostKeyRepository(config.pinnedHostKey));
      next.setServerAliveInterval(SERVER_ALIVE_INTERVAL_MS);
      next.setServerAliveCountMax(SERVER_ALIVE_COUNT_MAX);
      next.setDaemonThread(true);
      next.connect(config.connectTimeoutMs);
      ready = true;
      return next;
    } catch (JSchException e) {
      throw categorize(e);
    } finally {
      if (!ready && next != null) next.disconnect();
    }
  }

  private void bindForwardWithRetry(Session active) throws TunnelException {
    try {
      active.setPortForwardingL(LOCAL_BIND, LOCAL_PORT, REMOTE_BIND, REMOTE_PORT);
    } catch (JSchException first) {
      // A just-closed session can still hold the loopback port while its watcher shuts down.
      String detail = first.getMessage();
      if (detail == null || !detail.toLowerCase(Locale.US).contains("already")) {
        throw categorize(first);
      }
      try {
        Thread.sleep(250);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        throw new TunnelException(ErrorCategory.CANCELLED, "Connection cancelled.", interrupted);
      }
      try {
        active.setPortForwardingL(LOCAL_BIND, LOCAL_PORT, REMOTE_BIND, REMOTE_PORT);
      } catch (JSchException second) {
        throw categorize(second);
      }
    }
  }

  private void assertUpstreamHealthy() throws TunnelException {
    if (!isUpstreamHealthy()) {
      throw new TunnelException(
          ErrorCategory.UPSTREAM, "Tunnel up but T3 server not responding.");
    }
  }

  private boolean isUpstreamHealthy() {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(UPSTREAM_HEALTH_URL).openConnection(java.net.Proxy.NO_PROXY);
      connection.setConnectTimeout(HEALTH_TIMEOUT_MS);
      connection.setReadTimeout(HEALTH_TIMEOUT_MS);
      connection.setInstanceFollowRedirects(false);
      connection.setRequestProperty("Accept", "application/json");
      if (connection.getResponseCode() != 200) return false;
      return readBody(connection).contains("\"environmentId\"");
    } catch (IOException | RuntimeException e) {
      return false;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  private static String readBody(HttpURLConnection connection) throws IOException {
    InputStream stream = connection.getInputStream();
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int total = 0;
    int read;
    while ((read = stream.read(chunk)) != -1) {
      total += read;
      if (total > HEALTH_BODY_LIMIT) return "";
      buffer.write(chunk, 0, read);
    }
    return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
  }

  static TunnelException categorize(Throwable error) {
    if (error instanceof TunnelException) return (TunnelException) error;
    if (
        error instanceof JSchChangedHostKeyException
            || error instanceof JSchUnknownHostKeyException) {
      return new TunnelException(ErrorCategory.HOST_KEY, "Server host key mismatch.", error);
    }
    if (error instanceof JSchException) {
      String message = error.getMessage();
      String lowered = message == null ? "" : message.toLowerCase(Locale.US);
      // The host-key subclasses have package-private constructors; the message fallback also
      // covers any wrapper that lost the specific type.
      if (lowered.contains("hostkey") || lowered.contains("host key")) {
        return new TunnelException(ErrorCategory.HOST_KEY, "Server host key mismatch.", error);
      }
      if (lowered.contains("auth")) {
        return new TunnelException(ErrorCategory.AUTH, "Authentication failed.", error);
      }
      if (lowered.contains("privatekey") || lowered.contains("private key")) {
        return new TunnelException(ErrorCategory.CONFIG, "Invalid SSH profile.", error);
      }
      Throwable cause = error.getCause();
      if (cause instanceof SocketTimeoutException || lowered.contains("timeout")) {
        return new TunnelException(ErrorCategory.TIMEOUT, "Connection timed out.", error);
      }
      if (
          cause instanceof UnknownHostException
              || cause instanceof ConnectException
              || cause instanceof NoRouteToHostException
              || cause instanceof SocketException
              || lowered.contains("socket")
              || lowered.contains("network")
              || lowered.contains("session is down")) {
        return new TunnelException(ErrorCategory.NETWORK, "Server unreachable.", error);
      }
    }
    if (error instanceof SocketTimeoutException) {
      return new TunnelException(ErrorCategory.TIMEOUT, "Connection timed out.", error);
    }
    if (error instanceof IOException) {
      return new TunnelException(ErrorCategory.NETWORK, "Server unreachable.", error);
    }
    return new TunnelException(ErrorCategory.UNKNOWN, "Connection failed.", error);
  }
}
