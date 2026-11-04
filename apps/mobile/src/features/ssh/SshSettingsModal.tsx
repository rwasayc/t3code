import { useTranslation } from "../../lib/i18n/useTranslation";
import { useAtomValue } from "@effect/atom-react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import * as Dialog from "../../components/ui/Dialog";
import { ListRow } from "../../components/ui/ListRow";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import type { TunnelPhase } from "./tunnel-controller";
import { useEnrollmentImport } from "./SshGateScreens";
import {
  closeSshSettings,
  sshSettingsOpenAtom,
  sshTunnelController,
  sshTunnelSnapshotAtom,
} from "./ssh-runtime";

export const SSH_PHASE_LABELS: Record<TunnelPhase, string> = {
  setup: "Not configured",
  connecting: "Connecting",
  connected: "Connected",
  failed: "Connection failed",
  paused: "Disconnected (reconnects when the app returns to the foreground)",
};

/**
 * SSH settings live in a modal owned by the gate rather than a navigation route so the stock
 * stack stays untouched; the Settings list opens it through sshSettingsOpenAtom.
 */
export function SshSettingsModal(props: {
  readonly pairingNeeded: boolean;
  readonly onShowPairing: () => void;
}) {
  const { t } = useTranslation();
  const open = useAtomValue(sshSettingsOpenAtom);
  const snapshot = useAtomValue(sshTunnelSnapshotAtom);
  const importAction = useEnrollmentImport(() => closeSshSettings());
  if (!open) return null;

  const controller = sshTunnelController();
  const confirmRemove = () =>
    Dialog.confirm({
      title: t("Delete connection configuration"),
      message: t(
        "This disconnects the SSH tunnel and removes the saved connection configuration. You can import a connection file again later.",
      ),
      confirmText: t("Delete"),
      destructive: true,
      onConfirm: () => {
        closeSshSettings();
        void controller?.removeProfile();
      },
    });

  return (
    <Modal visible animationType="slide" onRequestClose={closeSshSettings}>
      <SafeAreaView className="flex-1 bg-screen">
        <View collapsable={false} className="flex-row items-center justify-between px-5 py-3">
          <Text textRole="headline" className="font-t3-bold text-foreground">
            {t("Workbench connection")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Close")}
            onPress={closeSshSettings}
            className="size-9 items-center justify-center rounded-full bg-subtle active:opacity-70"
          >
            <SymbolView name="xmark" size={16} tintColorClassName="accent-foreground-muted" />
          </Pressable>
        </View>
        <View collapsable={false} className="gap-4 px-5 pt-2">
          <View collapsable={false} className="overflow-hidden rounded-[26px] bg-grouped-card">
            {snapshot.profile ? (
              <>
                <ListRowLayout label={t("Name")} detail={snapshot.profile.name} />
                <ListRowLayout
                  label={t("Server")}
                  detail={`${snapshot.profile.host}:${snapshot.profile.port}`}
                />
              </>
            ) : (
              <ListRowLayout label={t("No connection file imported")} />
            )}
            <ListRowLayout label={t("Status")} detail={t(SSH_PHASE_LABELS[snapshot.phase])} />
          </View>
          <View collapsable={false} className="overflow-hidden rounded-[26px] bg-grouped-card">
            <ListRow
              icon="arrow.clockwise"
              label={t("Reconnect")}
              disabled={snapshot.profile === null}
              onPress={() => {
                closeSshSettings();
                void controller?.retry();
              }}
            />
            <ListRow
              icon="doc.text"
              label={t("Change connection file")}
              description={t("Import a different connection file and connect immediately")}
              onPress={() => void importAction.start()}
            />
            <ListRow
              icon="trash"
              label={t("Delete connection configuration")}
              disabled={snapshot.profile === null}
              onPress={confirmRemove}
            />
          </View>
          {props.pairingNeeded ? (
            <View collapsable={false} className="overflow-hidden rounded-[26px] bg-grouped-card">
              <ListRow
                icon="link"
                label={t("Pair workbench")}
                description={t("Enter a T3 pairing code to complete initial pairing")}
                onPress={() => {
                  closeSshSettings();
                  props.onShowPairing();
                }}
              />
            </View>
          ) : null}
          {importAction.error ? (
            <Text textRole="footnote" className="px-4 text-danger-foreground">
              {t(importAction.error)}
            </Text>
          ) : null}
          <Text textRole="footnote" className="px-4 leading-normal text-foreground-muted">
            {t(
              "The tunnel listens only on 127.0.0.1. T3 access-token authentication is still required while connected.",
            )}
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
