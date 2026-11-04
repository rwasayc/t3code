import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

import type { SshTunnelProfile } from "./enrollment";
import { TunnelConnectError, tunnelErrorCategoryOf } from "./tunnel-errors";

export type TunnelEvent = { readonly type: "dropped" };

interface T3SshNativeModule {
  readBundledEnrollment(): Promise<string | null>;
  connect(configJson: string): Promise<null>;
  disconnect(): Promise<null>;
  isConnected(): boolean;
  addListener(
    eventName: "onTunnelState",
    listener: (event: TunnelEvent) => void,
  ): { remove(): void };
}

const native =
  Platform.OS === "android" ? requireOptionalNativeModule<T3SshNativeModule>("T3Ssh") : null;

export async function readBundledEnrollment(): Promise<string | null> {
  return native?.readBundledEnrollment() ?? null;
}

function serializeConfig(profile: SshTunnelProfile): string {
  // Fixed key order so the native coalescing key is stable for identical profiles.
  return JSON.stringify({
    host: profile.host,
    port: profile.port,
    username: profile.username,
    hostKey: profile.hostKey,
    privateKey: profile.privateKey,
    connectTimeoutMs: 15_000,
  });
}

function toTunnelConnectError(cause: unknown): TunnelConnectError {
  if (cause instanceof TunnelConnectError) return cause;
  const category = tunnelErrorCategoryOf(cause);
  // Native messages are fixed per category; anything else is replaced with the bare category
  // so a JSch detail string (or an accidental credential echo) can never surface in UI state.
  return new TunnelConnectError(category, category);
}

export async function nativeTunnelConnect(profile: SshTunnelProfile): Promise<void> {
  if (native === null) {
    throw new TunnelConnectError("UNKNOWN", "UNKNOWN");
  }
  try {
    await native.connect(serializeConfig(profile));
  } catch (cause) {
    throw toTunnelConnectError(cause);
  }
}

export async function nativeTunnelDisconnect(): Promise<void> {
  try {
    await native?.disconnect();
  } catch {
    // Disconnect is best-effort teardown; there is nothing actionable to report.
  }
}

export function addTunnelEventListener(
  listener: (event: TunnelEvent) => void,
): (() => void) | null {
  if (native === null || typeof native.addListener !== "function") return null;
  const subscription = native.addListener("onTunnelState", listener);
  return () => subscription.remove();
}
