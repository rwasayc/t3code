import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { SshTunnelProfile } from "./enrollment";
import { TUNNEL_ERROR_MESSAGES, TunnelConnectError } from "./tunnel-errors";
import {
  BACKGROUND_DISCONNECT_DELAY_MS,
  TunnelController,
  type TunnelSnapshot,
} from "./tunnel-controller";

const WIRE_KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIAcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH";
const SECRET_MARKER = "MIIEowIBAAKCAQEAsuperSecretKeyBody";

function profile(name: string, host = "47.98.12.3"): SshTunnelProfile {
  return {
    schemaVersion: 1,
    name,
    host,
    port: 22,
    username: "tunnel",
    hostKey: `ssh-ed25519 ${WIRE_KEY}`,
    privateKey: `-----BEGIN RSA PRIVATE KEY-----\n${SECRET_MARKER}\n-----END RSA PRIVATE KEY-----\n`,
  };
}

/** Flushes the microtask queue (async store hops) without waiting on wall-clock time. */
const flush = () => vi.advanceTimersByTimeAsync(0);

class FakeBridge {
  connectCalls: SshTunnelProfile[] = [];
  disconnectCalls = 0;
  pending: Array<{ resolve: () => void; reject: (cause: unknown) => void }> = [];

  connect(profile: SshTunnelProfile): Promise<void> {
    this.connectCalls.push(profile);
    return new Promise<void>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }

  settleNext(error?: unknown): void {
    const next = this.pending.shift();
    if (!next) throw new Error("no pending connect");
    if (error === undefined) next.resolve();
    else next.reject(error);
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }
}

interface Harness {
  controller: TunnelController;
  bridge: FakeBridge;
  appState: { emit(state: "active" | "background"): void };
  network: { emit(): void };
  dropped: { emit(): void };
  snapshots: TunnelSnapshot[];
  saved: SshTunnelProfile[];
  cleared: () => number;
  setHandoff(active: boolean): void;
}

function createHarness(storedProfile: SshTunnelProfile | null): Harness {
  const bridge = new FakeBridge();
  const snapshots: TunnelSnapshot[] = [];
  const saved: SshTunnelProfile[] = [];
  let cleared = 0;
  let appStateListener: ((state: "active" | "background") => void) | null = null;
  let networkListener: (() => void) | null = null;
  let droppedListener: (() => void) | null = null;
  let handoff = false;
  const controller = new TunnelController({
    bridge,
    loadProfile: async () => storedProfile,
    saveProfile: async (next) => {
      saved.push(next);
    },
    clearProfile: async () => {
      cleared += 1;
    },
    subscribeAppState: (listener) => {
      appStateListener = listener;
      return () => {};
    },
    isForegroundHandoffActive: () => handoff,
    subscribeNetworkChanges: (listener) => {
      networkListener = listener;
      return () => {};
    },
    subscribeTunnelDropped: (listener) => {
      droppedListener = listener;
      return () => {};
    },
  });
  controller.subscribe((snapshot) => snapshots.push(snapshot));
  return {
    controller,
    bridge,
    snapshots,
    saved,
    cleared: () => cleared,
    setHandoff: (active) => {
      handoff = active;
    },
    appState: {
      emit: (state) => appStateListener?.(state),
    },
    network: {
      emit: () => networkListener?.(),
    },
    dropped: {
      emit: () => droppedListener?.(),
    },
  };
}

describe("TunnelController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows setup when no profile is stored", async () => {
    const harness = createHarness(null);
    await harness.controller.start();
    expect(harness.controller.getSnapshot().phase).toBe("setup");
    expect(harness.bridge.connectCalls).toHaveLength(0);
  });

  it("connects with the stored profile on start", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    expect(harness.controller.getSnapshot().phase).toBe("connecting");
    harness.bridge.settleNext();
    await started;
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.phase).toBe("connected");
    expect(snapshot.hasConnectedOnce).toBe(true);
    expect(snapshot.profile?.name).toBe("工作台");
  });

  it("maps failures to safe localized messages without leaking key material", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext(
      new TunnelConnectError({
        category: "AUTH",
        message: `Auth fail: key ${SECRET_MARKER} refused by 47.98.12.3`,
      }),
    );
    await started;
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.phase).toBe("failed");
    expect(snapshot.errorCategory).toBe("AUTH");
    expect(snapshot.errorMessage).toBe(TUNNEL_ERROR_MESSAGES.AUTH);
    expect(snapshot.errorMessage).not.toContain(SECRET_MARKER);
    expect(snapshot.errorMessage).not.toContain("47.98.12.3");
  });

  it("coalesces concurrent connects onto the in-flight attempt", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    void harness.controller.connect();
    void harness.controller.connect();
    expect(harness.bridge.connectCalls).toHaveLength(1);
    harness.bridge.settleNext();
    await started;
    expect(harness.controller.getSnapshot().phase).toBe("connected");
  });

  it("never lets a superseded attempt revive the tunnel", async () => {
    const harness = createHarness(profile("旧配置"));
    const started = harness.controller.start();
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(1);
    // Re-import while the first attempt is still in flight.
    const imported = harness.controller.importProfile(profile("新配置", "121.40.0.8"));
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(2);
    // The stale first attempt now succeeds — too late, it must be ignored.
    harness.bridge.settleNext();
    await started;
    expect(harness.controller.getSnapshot().phase).toBe("connecting");
    harness.bridge.settleNext();
    await imported;
    const snapshot = harness.controller.getSnapshot();
    expect(snapshot.phase).toBe("connected");
    expect(snapshot.profile?.host).toBe("121.40.0.8");
    expect(harness.saved).toHaveLength(1);
  });

  it("drops a stale failure instead of flashing an error", async () => {
    const harness = createHarness(profile("旧配置"));
    const started = harness.controller.start();
    await flush();
    const imported = harness.controller.importProfile(profile("新配置", "121.40.0.8"));
    await flush();
    harness.bridge.settleNext(
      new TunnelConnectError({ category: "NETWORK", message: "socket closed for old profile" }),
    );
    await started;
    expect(harness.controller.getSnapshot().phase).toBe("connecting");
    harness.bridge.settleNext();
    await imported;
    expect(harness.controller.getSnapshot().phase).toBe("connected");
  });

  it("disconnects after a background debounce and reconnects on resume", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext();
    await started;

    harness.appState.emit("background");
    vi.advanceTimersByTime(BACKGROUND_DISCONNECT_DELAY_MS - 1);
    expect(harness.bridge.disconnectCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.bridge.disconnectCalls).toBe(1);
    expect(harness.controller.getSnapshot().phase).toBe("paused");

    harness.appState.emit("active");
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(2);
    harness.bridge.settleNext();
    await flush();
    expect(harness.controller.getSnapshot().phase).toBe("connected");
  });

  it("cancels the background disconnect when the app returns quickly", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext();
    await started;

    harness.appState.emit("background");
    vi.advanceTimersByTime(2_000);
    harness.appState.emit("active");
    await vi.advanceTimersByTimeAsync(BACKGROUND_DISCONNECT_DELAY_MS);
    expect(harness.bridge.disconnectCalls).toBe(0);
    // A quick return only re-verifies upstream health; leave no dangling attempt behind.
    harness.bridge.settleNext();
  });

  it("keeps the tunnel up while a foreground handoff (document picker) is open", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext();
    await started;

    harness.setHandoff(true);
    harness.appState.emit("background");
    await vi.advanceTimersByTimeAsync(BACKGROUND_DISCONNECT_DELAY_MS * 2);
    expect(harness.bridge.disconnectCalls).toBe(0);
    expect(harness.controller.getSnapshot().phase).toBe("connected");
  });

  it("reconnects on network changes while connected or failed", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext();
    await started;
    harness.network.emit();
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(2);
    harness.bridge.settleNext(
      new TunnelConnectError({ category: "TIMEOUT", message: "timed out" }),
    );
    await flush();
    expect(harness.controller.getSnapshot().phase).toBe("failed");
    harness.network.emit();
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(3);
  });

  it("reconnects when the native side reports the tunnel dropped", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext();
    await started;
    harness.dropped.emit();
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(2);
  });

  it("removing the profile disconnects and returns to setup", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext();
    await started;
    await harness.controller.removeProfile();
    expect(harness.cleared()).toBe(1);
    expect(harness.bridge.disconnectCalls).toBe(1);
    expect(harness.controller.getSnapshot().phase).toBe("setup");
  });
});

describe("TunnelController lifecycle races", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not open a tunnel when profile loading finishes after disposal", async () => {
    let finishLoading!: (value: SshTunnelProfile) => void;
    const loading = new Promise<SshTunnelProfile>((resolve) => {
      finishLoading = resolve;
    });
    const bridge = new FakeBridge();
    const controller = new TunnelController({
      bridge,
      loadProfile: () => loading,
      saveProfile: async () => {},
      clearProfile: async () => {},
    });
    const started = controller.start();
    controller.dispose();
    finishLoading(profile("工作台"));
    await started;
    expect(bridge.connectCalls).toHaveLength(0);
  });

  it("reconnects on resume while a cancelled connect and background disconnect are pending", async () => {
    const harness = createHarness(profile("工作台"));
    let finishDisconnect!: () => void;
    harness.bridge.disconnect = () =>
      new Promise<void>((resolve) => {
        finishDisconnect = resolve;
      });
    const started = harness.controller.start();
    await flush();
    harness.appState.emit("background");
    await vi.advanceTimersByTimeAsync(BACKGROUND_DISCONNECT_DELAY_MS);
    harness.appState.emit("active");
    await flush();
    expect(harness.bridge.connectCalls).toHaveLength(2);
    harness.bridge.settleNext();
    await started;
    expect(harness.controller.getSnapshot().phase).toBe("connecting");
    harness.bridge.settleNext();
    await flush();
    finishDisconnect();
    await flush();
    expect(harness.controller.getSnapshot().phase).toBe("connected");
  });

  it("surfaces storage failures as a recoverable redacted configuration error", async () => {
    const controller = new TunnelController({
      bridge: new FakeBridge(),
      loadProfile: async () => {
        throw new Error(SECRET_MARKER);
      },
      saveProfile: async () => {},
      clearProfile: async () => {},
    });
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      phase: "failed",
      errorCategory: "CONFIG",
      errorMessage: TUNNEL_ERROR_MESSAGES.CONFIG,
    });
    expect(controller.getSnapshot().errorMessage).not.toContain(SECRET_MARKER);
  });

  it("allows retry after an active attempt is unexpectedly cancelled", async () => {
    const harness = createHarness(profile("工作台"));
    const started = harness.controller.start();
    await flush();
    harness.bridge.settleNext(
      new TunnelConnectError({ category: "CANCELLED", message: "cancelled" }),
    );
    await started;
    expect(harness.controller.getSnapshot().phase).toBe("failed");
    const retried = harness.controller.retry();
    expect(harness.bridge.connectCalls).toHaveLength(2);
    harness.bridge.settleNext();
    await retried;
    expect(harness.controller.getSnapshot().phase).toBe("connected");
  });
});

it("connects an imported profile when the picker resolves before the foreground event", async () => {
  const harness = createHarness(null);
  await harness.controller.start();
  harness.appState.emit("background");
  await harness.controller.importProfile(profile("工作台"));
  expect(harness.bridge.connectCalls).toHaveLength(0);
  harness.appState.emit("active");
  expect(harness.bridge.connectCalls).toHaveLength(1);
  harness.bridge.settleNext();
  await Promise.resolve();
  expect(harness.controller.getSnapshot().phase).toBe("connected");
});
