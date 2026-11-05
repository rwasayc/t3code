package expo.modules.t3agentnotifications

import android.content.Context
import java.util.Locale

internal const val LANGUAGE_STORE = "t3-agent-notification-language"

private val CHINESE_NOTIFICATION_TEXT = mapOf(
  "Connecting" to "连接中", "Starting" to "启动中", "Working" to "工作中",
  "Open" to "打开", "Approval" to "待审批", "Approval needed" to "需要审批",
  "Approve" to "审批", "Input" to "待输入", "Question for you" to "需要你回答",
  "Answer" to "回答", "Waiting" to "等待中", "Waiting for an update" to "等待更新",
  "Done" to "已完成", "Finished" to "已结束", "Failed" to "失败",
  "Agent activity" to "智能体动态", "Active" to "活跃", "Dismiss" to "关闭",
  "Agent alerts" to "智能体提醒", "Ongoing agent activity" to "正在进行的智能体任务",
  "1 needs you" to "1 项需要你处理", "{count} need you" to "{count} 项需要你处理",
  "{count} failed" to "{count} 项失败", "{count} working" to "{count} 项工作中",
  "Finished, {count} failed" to "已结束，{count} 项失败", "All finished" to "全部已结束",
  "{count} live" to "{count} 项进行中", "{count} active" to "{count} 项活跃",
  "{count} threads" to "{count} 个会话"
)

internal fun notificationTranslator(context: Context): (String) -> String {
  val language = context.getSharedPreferences(LANGUAGE_STORE, Context.MODE_PRIVATE)
    .getString("language", null) ?: Locale.getDefault().language
  return { source ->
    if (language.startsWith("zh")) CHINESE_NOTIFICATION_TEXT[source] ?: source else source
  }
}
