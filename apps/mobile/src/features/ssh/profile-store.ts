import * as SecureStore from "expo-secure-store";

import { parseEnrollment, stripPairingCode, type SshTunnelProfile } from "./enrollment";
import { readBundledEnrollment } from "./native-tunnel";

// The personal embedded APK can seed this Keystore-backed store on its first launch.
const PROFILE_STORAGE_KEY = "t3-ssh-tunnel-profile-v1";
const BUNDLED_INSTALLED_KEY = "t3-ssh-bundled-installed-v1";

export async function loadSshProfile(): Promise<SshTunnelProfile | null> {
  const raw = await SecureStore.getItemAsync(PROFILE_STORAGE_KEY);
  if (raw !== null) {
    try {
      return parseEnrollment(raw);
    } catch {
      // Invalid stored entries can be replaced by the bundled enrollment below.
    }
  }
  if (await SecureStore.getItemAsync(BUNDLED_INSTALLED_KEY)) return null;
  const bundled = await readBundledEnrollment();
  if (bundled === null) return null;
  const profile = parseEnrollment(bundled);
  await saveSshProfile(profile);
  await SecureStore.setItemAsync(BUNDLED_INSTALLED_KEY, "1");
  return profile;
}

export async function saveSshProfile(profile: SshTunnelProfile): Promise<void> {
  await SecureStore.setItemAsync(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export async function clearSshProfile(): Promise<void> {
  await SecureStore.setItemAsync(BUNDLED_INSTALLED_KEY, "1");
  await SecureStore.deleteItemAsync(PROFILE_STORAGE_KEY);
}

/** Called after a successful pair: the one-time code must not outlive it. */
export async function stripStoredPairingCode(): Promise<void> {
  const profile = await loadSshProfile();
  if (profile?.pairingCode === undefined) return;
  await saveSshProfile(stripPairingCode(profile));
}
