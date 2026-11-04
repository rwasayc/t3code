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
  setup: "未配置",
  connecting: "正在连接",
  connected: "已连接",
  failed: "连接失败",
  paused: "已断开（回到前台时自动重连）",
};

/**
 * SSH settings live in a modal owned by the gate rather than a navigation route so the stock
 * stack stays untouched; the Settings list opens it through sshSettingsOpenAtom.
 */
export function SshSettingsModal(props: {
  readonly pairingNeeded: boolean;
  readonly onShowPairing: () => void;
}) {
  const open = useAtomValue(sshSettingsOpenAtom);
  const snapshot = useAtomValue(sshTunnelSnapshotAtom);
  const importAction = useEnrollmentImport(() => closeSshSettings());
  if (!open) return null;

  const controller = sshTunnelController();
  const confirmRemove = () =>
    Dialog.confirm({
      title: "删除连接配置",
      message: "将断开 SSH 隧道并删除已保存的连接配置，之后可重新导入连接文件。",
      confirmText: "删除",
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
            工作台连接
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
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
                <ListRowLayout label="名称" detail={snapshot.profile.name} />
                <ListRowLayout
                  label="服务器"
                  detail={`${snapshot.profile.host}:${snapshot.profile.port}`}
                />
              </>
            ) : (
              <ListRowLayout label="尚未导入连接文件" />
            )}
            <ListRowLayout label="状态" detail={SSH_PHASE_LABELS[snapshot.phase]} />
          </View>
          <View collapsable={false} className="overflow-hidden rounded-[26px] bg-grouped-card">
            <ListRow
              icon="arrow.clockwise"
              label="重新连接"
              disabled={snapshot.profile === null}
              onPress={() => {
                closeSshSettings();
                void controller?.retry();
              }}
            />
            <ListRow
              icon="doc.text"
              label="更换连接文件"
              description="重新导入连接文件并立即连接"
              onPress={() => void importAction.start()}
            />
            <ListRow
              icon="trash"
              label="删除连接配置"
              disabled={snapshot.profile === null}
              onPress={confirmRemove}
            />
          </View>
          {props.pairingNeeded ? (
            <View collapsable={false} className="overflow-hidden rounded-[26px] bg-grouped-card">
              <ListRow
                icon="link"
                label="配对工作台"
                description="输入 T3 配对码完成首次配对"
                onPress={() => {
                  closeSshSettings();
                  props.onShowPairing();
                }}
              />
            </View>
          ) : null}
          {importAction.error ? (
            <Text textRole="footnote" className="px-4 text-danger-foreground">
              {importAction.error}
            </Text>
          ) : null}
          <Text textRole="footnote" className="px-4 leading-normal text-foreground-muted">
            隧道仅绑定本机 127.0.0.1，连接期间应用仍需通过 T3 的访问令牌认证。
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
