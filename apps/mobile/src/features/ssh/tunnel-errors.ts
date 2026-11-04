/** Mirrors TunnelClient.ErrorCategory; the native side rejects with these as the error code. */
export type TunnelErrorCategory =
  | "CONFIG"
  | "AUTH"
  | "HOST_KEY"
  | "NETWORK"
  | "TIMEOUT"
  | "UPSTREAM"
  | "CANCELLED"
  | "UNKNOWN";

const TUNNEL_ERROR_CATEGORIES: ReadonlyArray<TunnelErrorCategory> = [
  "CONFIG",
  "AUTH",
  "HOST_KEY",
  "NETWORK",
  "TIMEOUT",
  "UPSTREAM",
  "CANCELLED",
  "UNKNOWN",
];

export class TunnelConnectError extends Error {
  readonly category: TunnelErrorCategory;

  constructor(category: TunnelErrorCategory, message: string) {
    super(message);
    this.name = "TunnelConnectError";
    this.category = category;
  }
}

export function tunnelErrorCategoryOf(cause: unknown): TunnelErrorCategory {
  if (cause instanceof TunnelConnectError) return cause.category;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  return typeof code === "string" &&
    (TUNNEL_ERROR_CATEGORIES as ReadonlyArray<string>).includes(code)
    ? (code as TunnelErrorCategory)
    : "UNKNOWN";
}

/** Fixed localized messages per category; native detail strings never reach UI state. */
export const TUNNEL_ERROR_MESSAGES: Record<TunnelErrorCategory, string> = {
  CONFIG: "连接配置无效，请重新导入连接文件。",
  AUTH: "服务器拒绝了登录密钥，请重新生成连接文件。",
  HOST_KEY: "服务器身份校验失败，可能遭到中间人攻击，请核对后重新导入连接文件。",
  NETWORK: "无法连接到服务器，请检查网络后重试。",
  TIMEOUT: "连接超时，请检查网络后重试。",
  UPSTREAM: "隧道已建立，但远端工作台无响应，请确认 Mac 上的 T3 正在运行。",
  CANCELLED: "连接已取消。",
  UNKNOWN: "连接失败，请稍后重试。",
};
