import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("./native-tunnel", () => ({ readBundledEnrollment: vi.fn() }));

import * as SecureStore from "expo-secure-store";
import { readBundledEnrollment } from "./native-tunnel";
import { clearSshProfile, loadSshProfile, stripStoredPairingCode } from "./profile-store";

const fixture = {
  schemaVersion: 1,
  name: "Fixture",
  host: "192.0.2.1",
  port: 22,
  username: "mobile",
  hostKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH",
  privateKey: "-----BEGIN RSA PRIVATE KEY-----\nfixture\n-----END RSA PRIVATE KEY-----",
  pairingCode: "FIXTURE_ONCE",
};

describe("bundled enrollment persistence", () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    vi.resetAllMocks();
    storage = new Map();
    vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => storage.get(key) ?? null);
    vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
      storage.set(key, value);
    });
    vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
      storage.delete(key);
    });
    vi.mocked(readBundledEnrollment).mockResolvedValue(JSON.stringify(fixture));
  });

  it("installs a bundled profile once and does not restore a spent pairing code", async () => {
    expect(await loadSshProfile()).toEqual(fixture);
    await stripStoredPairingCode();
    expect(await loadSshProfile()).toMatchObject({
      host: fixture.host,
      privateKey: fixture.privateKey,
    });
    expect((await loadSshProfile())?.pairingCode).toBeUndefined();
    expect(readBundledEnrollment).toHaveBeenCalledTimes(1);
  });

  it("preserves an already configured phone when installing an update", async () => {
    storage.set("t3-ssh-tunnel-profile-v1", JSON.stringify({ ...fixture, host: "192.0.2.2" }));
    expect((await loadSshProfile())?.host).toBe("192.0.2.2");
    expect(readBundledEnrollment).not.toHaveBeenCalled();
  });

  it("does not resurrect the bundled configuration after the user removes it", async () => {
    await loadSshProfile();
    await clearSshProfile();
    expect(await loadSshProfile()).toBeNull();
    expect(readBundledEnrollment).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed bundle without persisting it", async () => {
    vi.mocked(readBundledEnrollment).mockResolvedValue('{"schemaVersion":2}');
    await expect(loadSshProfile()).rejects.toThrow();
    expect(storage.size).toBe(0);
  });
});
