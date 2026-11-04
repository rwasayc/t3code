import type { SshTunnelProfile } from "./enrollment";
import {
  TUNNEL_ERROR_MESSAGES,
  tunnelErrorCategoryOf,
  type TunnelErrorCategory,
} from "./tunnel-errors";

/**
 * Every lifecycle action invalidates older completions. The bridge serializes socket work
 * and closes stale sessions; the controller preserves UI state across reconnects.
 */

export type TunnelPhase = "setup" | "connecting" | "connected" | "failed" | "paused";

export interface TunnelProfileSummary {
  readonly name: string;
  readonly host: string;
  readonly port: number;
}

export interface TunnelSnapshot {
  readonly phase: TunnelPhase;
  readonly profile: TunnelProfileSummary | null;
  /** Once true, the app UI stays mounted and reconnect states render as an overlay. */
  readonly hasConnectedOnce: boolean;
  readonly errorMessage: string | null;
  readonly errorCategory: TunnelErrorCategory | null;
}

export interface TunnelBridge {
  connect(profile: SshTunnelProfile): Promise<void>;
  disconnect(): Promise<void>;
}

export interface TunnelControllerDeps {
  readonly bridge: TunnelBridge;
  readonly loadProfile: () => Promise<SshTunnelProfile | null>;
  readonly saveProfile: (profile: SshTunnelProfile) => Promise<void>;
  readonly clearProfile: () => Promise<void>;
  readonly subscribeAppState?: (listener: (state: "active" | "background") => void) => () => void;
  readonly isForegroundHandoffActive?: () => boolean;
  /** Fires on Wi-Fi/cellular path changes; the listener runs only while the app is active. */
  readonly subscribeNetworkChanges?: (listener: () => void) => () => void;
  readonly subscribeTunnelDropped?: (listener: () => void) => () => void;
}

/** App-switching and the document picker settle within seconds; only real backgrounding tears down. */
export const BACKGROUND_DISCONNECT_DELAY_MS = 10_000;

type Listener = (snapshot: TunnelSnapshot) => void;

function summarize(profile: SshTunnelProfile): TunnelProfileSummary {
  return { name: profile.name, host: profile.host, port: profile.port };
}

export class TunnelController {
  private readonly deps: TunnelControllerDeps;
  private readonly listeners = new Set<Listener>();
  private phase: TunnelPhase = "connecting";
  private profile: SshTunnelProfile | null = null;
  private hasConnectedOnce = false;
  private errorMessage: string | null = null;
  private errorCategory: TunnelErrorCategory | null = null;
  private generation = 0;
  private connectingProfile: SshTunnelProfile | null = null;
  private appState: "active" | "background" = "active";
  private backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private disposers: Array<() => void> = [];

  constructor(deps: TunnelControllerDeps) {
    this.deps = deps;
  }

  getSnapshot(): TunnelSnapshot {
    return {
      phase: this.phase,
      profile: this.profile === null ? null : summarize(this.profile),
      hasConnectedOnce: this.hasConnectedOnce,
      errorMessage: this.errorMessage,
      errorCategory: this.errorCategory,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const loadGeneration = ++this.generation;
    const { subscribeAppState, subscribeNetworkChanges, subscribeTunnelDropped } = this.deps;
    if (subscribeAppState) {
      this.disposers.push(subscribeAppState((state) => this.handleAppState(state)));
    }
    if (subscribeNetworkChanges) {
      this.disposers.push(subscribeNetworkChanges(() => this.handleNetworkChange()));
    }
    if (subscribeTunnelDropped) {
      this.disposers.push(subscribeTunnelDropped(() => this.handleTunnelDropped()));
    }
    let profile: SshTunnelProfile | null;
    try {
      profile = await this.deps.loadProfile();
    } catch {
      if (!this.started || loadGeneration !== this.generation) return;
      this.errorCategory = "CONFIG";
      this.errorMessage = TUNNEL_ERROR_MESSAGES.CONFIG;
      this.setPhase("failed");
      return;
    }
    if (!this.started || loadGeneration !== this.generation) return;
    this.profile = profile;
    if (this.profile === null) {
      this.setPhase("setup");
      return;
    }
    if (this.appState === "background") {
      this.setPhase("paused");
      return;
    }
    await this.connect();
  }

  dispose(): void {
    this.generation += 1;
    this.started = false;
    this.connectingProfile = null;
    void this.deps.bridge.disconnect().catch(() => {});
    if (this.backgroundTimer !== null) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.listeners.clear();
  }

  /** Connects (or reconnects) using the stored profile. Coalesces with an in-flight attempt. */
  async connect(): Promise<void> {
    if (!this.started || this.appState !== "active") return;
    const profile = this.profile;
    if (profile === null) {
      this.setPhase("setup");
      return;
    }
    if (this.phase === "connecting" && this.connectingProfile === profile) return;
    const generation = ++this.generation;
    this.connectingProfile = profile;
    this.errorMessage = null;
    this.errorCategory = null;
    this.setPhase("connecting");
    try {
      await this.deps.bridge.connect(profile);
    } catch (cause) {
      if (generation !== this.generation) return;
      this.connectingProfile = null;
      const category = tunnelErrorCategoryOf(cause);
      this.errorCategory = category;
      this.errorMessage = TUNNEL_ERROR_MESSAGES[category];
      this.setPhase("failed");
      return;
    }
    if (generation !== this.generation) return;
    this.connectingProfile = null;
    this.hasConnectedOnce = true;
    this.setPhase("connected");
  }

  /** Tears the tunnel down without changing the stored profile (used for backgrounding). */
  async disconnect(): Promise<void> {
    this.generation += 1;
    this.connectingProfile = null;
    if (this.profile !== null) this.setPhase("paused");
    await this.deps.bridge.disconnect();
  }

  /** Manual retry from the failure UI. */
  async retry(): Promise<void> {
    await this.connect();
  }

  /** Replaces the profile (re-import) and connects with it immediately. */
  async importProfile(profile: SshTunnelProfile): Promise<void> {
    await this.deps.saveProfile(profile);
    this.profile = profile;
    this.generation += 1;
    this.hasConnectedOnce = false;
    this.errorMessage = null;
    this.errorCategory = null;
    // Any in-flight attempt for the old profile no longer matches connectingProfile, so the
    // phase guard lets this through and the bridge supersedes the stale native job.
    await this.connect();
  }

  async removeProfile(): Promise<void> {
    this.generation += 1;
    this.profile = null;
    this.hasConnectedOnce = false;
    this.errorMessage = null;
    this.errorCategory = null;
    await this.deps.clearProfile();
    await this.deps.bridge.disconnect();
    this.setPhase("setup");
  }

  private setPhase(phase: TunnelPhase): void {
    if (this.phase === phase) {
      this.emit();
      return;
    }
    this.phase = phase;
    this.emit();
  }

  private handleAppState(state: "active" | "background"): void {
    this.appState = state;
    if (state === "active") {
      if (this.backgroundTimer !== null) {
        clearTimeout(this.backgroundTimer);
        this.backgroundTimer = null;
      }
      // Resume: reconnect before/alongside the normal T3 reconnect machinery. A "connected"
      // session re-verifies upstream health; paused/failed states come back on their own.
      if (this.profile !== null) void this.connect();
      return;
    }
    if (this.profile === null) return;
    if (this.backgroundTimer !== null) clearTimeout(this.backgroundTimer);
    this.backgroundTimer = setTimeout(() => {
      this.backgroundTimer = null;
      if (this.appState !== "background") return;
      if (this.deps.isForegroundHandoffActive?.() === true) return;
      this.generation += 1;
      this.connectingProfile = null;
      this.setPhase("paused");
      void this.deps.bridge.disconnect().catch(() => {});
    }, BACKGROUND_DISCONNECT_DELAY_MS);
  }

  private handleNetworkChange(): void {
    if (this.appState !== "active" || this.profile === null) return;
    if (this.phase === "connected" || this.phase === "failed") void this.connect();
  }

  private handleTunnelDropped(): void {
    if (this.appState !== "active" || this.profile === null) return;
    if (this.phase === "connected") void this.connect();
  }
}
