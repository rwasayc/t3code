import { Atom } from "effect/reactivity";
import * as Network from "expo-network";
import { AppState } from "react-native";

import { isForegroundHandoffActive } from "../../lib/foreground-handoff";
import { appAtomRegistry } from "../../state/atom-registry";
import {
  addTunnelEventListener,
  nativeTunnelConnect,
  nativeTunnelDisconnect,
} from "./native-tunnel";
import { clearSshProfile, loadSshProfile, saveSshProfile } from "./profile-store";
import { isSshPersonalBuild } from "./ssh-build";
import { TunnelController, type TunnelSnapshot } from "./tunnel-controller";

export const sshTunnelSnapshotAtom = Atom.make<TunnelSnapshot>({
  phase: "connecting",
  profile: null,
  hasConnectedOnce: false,
  errorMessage: null,
  errorCategory: null,
}).pipe(Atom.keepAlive, Atom.withLabel("mobile:ssh-tunnel-snapshot"));

/** Settings rows flip this; the gate renders the modal outside the navigation tree. */
export const sshSettingsOpenAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:ssh-settings-open"),
);

export function openSshSettings(): void {
  appAtomRegistry.set(sshSettingsOpenAtom, true);
}

export function closeSshSettings(): void {
  appAtomRegistry.set(sshSettingsOpenAtom, false);
}

let sharedController: TunnelController | null = null;

/** Null on non-personal builds so callers never have to repeat the gate check. */
export function sshTunnelController(): TunnelController | null {
  return sharedController;
}

function subscribeNetworkPathChanges(listener: () => void): () => void {
  let previousType: Network.NetworkStateType | undefined;
  let sawOffline = false;
  const record = (state: Network.NetworkState) => {
    if (state.isConnected !== true) {
      if (state.isConnected === false) sawOffline = true;
      return;
    }
    const changed = (previousType !== undefined && state.type !== previousType) || sawOffline;
    sawOffline = false;
    previousType = state.type ?? previousType;
    if (changed) listener();
  };
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (previousType === undefined && state.isConnected === true) previousType = state.type;
    })
    .catch(() => undefined);
  const subscription = Network.addNetworkStateListener(record);
  return () => subscription.remove();
}

/**
 * Installs the SSH tunnel lifecycle for the personal Android build. Runs beside the app's other
 * module-level services; the official build and non-Android surfaces get a no-op disposer. When
 * the native module is absent (stale dev client) the controller still runs and surfaces the
 * bridge's UNKNOWN failure instead of spinning forever.
 */
export function installSshTunnelRuntime(): () => void {
  if (!isSshPersonalBuild()) return () => undefined;
  const controller = new TunnelController({
    bridge: { connect: nativeTunnelConnect, disconnect: nativeTunnelDisconnect },
    loadProfile: loadSshProfile,
    saveProfile: saveSshProfile,
    clearProfile: clearSshProfile,
    subscribeAppState: (listener) => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active" || state === "background") listener(state);
      });
      return () => subscription.remove();
    },
    isForegroundHandoffActive,
    subscribeNetworkChanges: subscribeNetworkPathChanges,
    subscribeTunnelDropped: (listener) => addTunnelEventListener(listener) ?? (() => undefined),
  });
  sharedController = controller;
  const unsubscribe = controller.subscribe((snapshot) => {
    appAtomRegistry.set(sshTunnelSnapshotAtom, snapshot);
  });
  void controller.start();
  return () => {
    unsubscribe();
    controller.dispose();
    if (sharedController === controller) sharedController = null;
  };
}
