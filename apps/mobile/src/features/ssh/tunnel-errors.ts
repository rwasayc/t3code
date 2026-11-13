import * as Schema from "effect/Schema";
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

export class TunnelConnectError extends Schema.TaggedError<TunnelConnectError>()(
  "TunnelConnectError",
  { category: Schema.Literals(TUNNEL_ERROR_CATEGORIES), message: Schema.String },
) {}

export const isTunnelConnectError = Schema.is(TunnelConnectError);

export function tunnelErrorCategoryOf(cause: unknown): TunnelErrorCategory {
  if (isTunnelConnectError(cause)) return cause.category;
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  return typeof code === "string" &&
    (TUNNEL_ERROR_CATEGORIES as ReadonlyArray<string>).includes(code)
    ? (code as TunnelErrorCategory)
    : "UNKNOWN";
}

/** Fixed localized messages per category; native detail strings never reach UI state. */
export const TUNNEL_ERROR_MESSAGES: Record<TunnelErrorCategory, string> = {
  CONFIG: "Invalid connection configuration. Import the connection file again.",
  AUTH: "The server rejected the login key. Generate a new connection file.",
  HOST_KEY:
    "Server identity verification failed. Verify the server and import the connection file again.",
  NETWORK: "Could not connect to the server. Check your network and try again.",
  TIMEOUT: "Connection timed out. Check your network and try again.",
  UPSTREAM:
    "The tunnel is connected but the remote workbench is not responding. Check that T3 is running on your Mac.",
  CANCELLED: "Connection cancelled.",
  UNKNOWN: "Connection failed. Try again later.",
};
