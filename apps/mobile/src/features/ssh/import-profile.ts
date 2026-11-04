import { beginForegroundHandoff } from "../../lib/foreground-handoff";
import { parseEnrollment, SSH_PROFILE_MAX_FILE_BYTES, type SshTunnelProfile } from "./enrollment";

export type EnrollmentImportResult =
  | { readonly status: "imported"; readonly profile: SshTunnelProfile }
  | { readonly status: "cancelled" };

export class EnrollmentTooLargeError extends Error {
  constructor() {
    super("The connection file is too large.");
    this.name = "EnrollmentTooLargeError";
  }
}

/**
 * Picks the enrollment JSON with the system document UI. The picked copy stays in the app cache
 * and is deleted right after reading; the parsed profile goes to expo-secure-store and nowhere
 * else. The handoff keeps the picker from looking like a backgrounding to the tunnel teardown.
 */
export async function importEnrollmentFile(): Promise<EnrollmentImportResult> {
  const endHandoff = beginForegroundHandoff();
  try {
    const { getDocumentAsync } = await import("expo-document-picker");
    const result = await getDocumentAsync({
      type: ["application/json", "text/plain", "*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return { status: "cancelled" };
    const asset = result.assets[0];
    if (!asset) return { status: "cancelled" };
    const { File } = await import("expo-file-system");
    const copy = new File(asset.uri);
    let text: string;
    try {
      if (typeof asset.size === "number" && asset.size > SSH_PROFILE_MAX_FILE_BYTES) {
        throw new EnrollmentTooLargeError();
      }
      text = await copy.text();
    } finally {
      try {
        if (copy.exists) copy.delete();
      } catch {
        // Cache cleanup is best-effort; the OS reclaims the cache either way.
      }
    }
    return { status: "imported", profile: parseEnrollment(text) };
  } finally {
    endHandoff();
  }
}
