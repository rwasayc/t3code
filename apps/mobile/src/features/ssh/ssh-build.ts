import Constants from "expo-constants";
import { Platform } from "react-native";

/** Loopback origin the tunnel exposes the workbench on; the server still requires T3 bearer auth. */
export const TUNNEL_HTTP_ORIGIN = "http://127.0.0.1:37730";

/**
 * The personal SSH build is a separate Android app id baked at prebuild time; the official app
 * and every non-Android surface must never see the tunnel gate.
 */
export function isSshPersonalBuild(): boolean {
  return (
    Platform.OS === "android" &&
    (Constants.expoConfig?.extra as { readonly sshPersonalBuild?: unknown } | undefined)
      ?.sshPersonalBuild === true
  );
}
