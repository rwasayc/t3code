import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import {
  pairEnvironment,
  useSavedRemoteConnections,
} from "../../state/use-remote-environment-registry";
import { autoPairOverTunnel } from "./auto-pair";
import { buildPairingUrl } from "../connection/pairing";
import { useConnectionController } from "../connection/useConnectionController";
import { stripStoredPairingCode } from "./profile-store";
import { isSshPersonalBuild, TUNNEL_HTTP_ORIGIN } from "./ssh-build";
import { sshTunnelSnapshotAtom } from "./ssh-runtime";
import {
  SshConnectingScreen,
  SshFailedScreen,
  SshPairingCard,
  SshReconnectOverlay,
  SshSetupScreen,
} from "./SshGateScreens";
import { SshSettingsModal } from "./SshSettingsModal";

export function SshTunnelGate({ children }: { readonly children: ReactNode }) {
  if (!isSshPersonalBuild()) return children;
  return <AndroidSshTunnelGate>{children}</AndroidSshTunnelGate>;
}

function reachesTunnelOrigin(httpBaseUrl: string): boolean {
  try {
    return new URL(httpBaseUrl).origin === TUNNEL_HTTP_ORIGIN;
  } catch {
    return false;
  }
}

// Outside the component: the React Compiler cannot lower try/finally in component scope.
async function redeemPairingCode(code: string): Promise<string | null> {
  try {
    const outcome = await pairEnvironment(buildPairingUrl(TUNNEL_HTTP_ORIGIN, code));
    if (!outcome.ok) return outcome.error ?? "Pairing failed. Try again.";
    await stripStoredPairingCode();
    return null;
  } catch {
    return "Pairing failed. Try again.";
  }
}

function AndroidSshTunnelGate({ children }: { readonly children: ReactNode }) {
  const snapshot = useAtomValue(sshTunnelSnapshotAtom);
  const { isLoadingSavedConnection, savedConnectionsById } = useSavedRemoteConnections();
  const connectionController = useConnectionController();
  const [pairingCode, setPairingCode] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingDismissed, setPairingDismissed] = useState(false);
  const kickDoneForConnect = useRef(false);

  const tunnelPaired = Object.values(savedConnectionsById).some((connection) =>
    reachesTunnelOrigin(connection.httpBaseUrl),
  );
  const connected = snapshot.phase === "connected";
  const needsPairing = connected && !isLoadingSavedConnection && !tunnelPaired;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- redeeming the one-time pairing code is an action keyed on the tunnel reaching connected, not renderable state
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void autoPairOverTunnel({
      tunnelPaired,
      onError: (message) => {
        if (!cancelled) setPairingError(message);
      },
    });
    return () => {
      cancelled = true;
    };
  }, [connected, tunnelPaired]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- once per tunnel connect, nudge the paired environment to re-probe through the fresh tunnel instead of waiting out its reconnect backoff
  useEffect(() => {
    if (!connected || !tunnelPaired) {
      kickDoneForConnect.current = false;
      return;
    }
    if (kickDoneForConnect.current) return;
    kickDoneForConnect.current = true;
    for (const connection of Object.values(savedConnectionsById)) {
      if (reachesTunnelOrigin(connection.httpBaseUrl)) {
        connectionController.retryEnvironment(connection.environmentId);
      }
    }
  }, [connected, tunnelPaired, savedConnectionsById, connectionController]);

  const submitPairingCode = async () => {
    const code = pairingCode.trim();
    if (code.length === 0 || pairingBusy) return;
    setPairingBusy(true);
    setPairingError(null);
    const message = await redeemPairingCode(code);
    setPairingBusy(false);
    if (message === null) {
      setPairingCode("");
    } else {
      setPairingError(message);
    }
  };

  // Before the first successful connect the app tree stays unmounted; afterwards it never
  // unmounts again, so navigation state and composer drafts survive background transitions.
  if (!snapshot.hasConnectedOnce) {
    if (snapshot.phase === "setup") return <SshSetupScreen />;
    if (snapshot.phase === "failed") return <SshFailedScreen message={snapshot.errorMessage} />;
    return <SshConnectingScreen profileName={snapshot.profile?.name ?? null} />;
  }

  return (
    <View collapsable={false} className="flex-1">
      {children}
      {needsPairing && !pairingDismissed ? (
        <SshPairingCard
          code={pairingCode}
          busy={pairingBusy}
          error={pairingError}
          onChangeCode={(code) => {
            setPairingCode(code);
            setPairingError(null);
          }}
          onSubmit={() => void submitPairingCode()}
          onSkip={() => setPairingDismissed(true)}
        />
      ) : null}
      {snapshot.phase === "connecting" ? (
        <SshReconnectOverlay failed={false} message={null} />
      ) : null}
      {snapshot.phase === "failed" ? (
        <SshReconnectOverlay failed message={snapshot.errorMessage} />
      ) : null}
      <SshSettingsModal
        pairingNeeded={needsPairing}
        onShowPairing={() => setPairingDismissed(false)}
      />
    </View>
  );
}
