import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { AppText as Text, AppTextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { EnrollmentRejection } from "./enrollment";
import { EnrollmentTooLargeError, importEnrollmentFile } from "./import-profile";
import { sshTunnelController } from "./ssh-runtime";

function importErrorMessage(cause: unknown): string {
  if (cause instanceof EnrollmentTooLargeError) return "文件过大，不是有效的连接文件。";
  if (cause instanceof EnrollmentRejection) {
    switch (cause.reason) {
      case "not-json":
        return "文件内容不是有效的 JSON。";
      case "unsupported-version":
        return "连接文件版本不受支持，请重新生成。";
      default:
        return "连接文件内容无效，请重新生成。";
    }
  }
  return "无法读取所选文件，请重试。";
}

type ImportOutcome =
  | { readonly status: "cancelled" }
  | { readonly status: "imported" }
  | { readonly status: "failed"; readonly message: string };

// Outside the components: the React Compiler cannot lower try/finally in component scope.
async function performEnrollmentImport(): Promise<ImportOutcome> {
  try {
    const result = await importEnrollmentFile();
    if (result.status === "cancelled") return { status: "cancelled" };
    const controller = sshTunnelController();
    if (!controller) return { status: "failed", message: "当前构建不包含 SSH 支持。" };
    await controller.importProfile(result.profile);
    return { status: "imported" };
  } catch (cause) {
    return { status: "failed", message: importErrorMessage(cause) };
  }
}

/** Shared by the setup/failed screens and the settings modal's re-import action. */
export function useEnrollmentImport(onImported?: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await performEnrollmentImport();
    setBusy(false);
    if (outcome.status === "failed") setError(outcome.message);
    else if (outcome.status === "imported") onImported?.();
  };
  return { busy, error, start };
}

function GateScaffold({ children }: { readonly children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-screen">
      <View collapsable={false} className="flex-1 items-center justify-center gap-4 px-8">
        {children}
      </View>
    </SafeAreaView>
  );
}

export function SshSetupScreen() {
  const importAction = useEnrollmentImport();
  return (
    <GateScaffold>
      <Text textRole="title" className="text-center font-t3-bold text-foreground">
        连接到工作台
      </Text>
      <Text textRole="body" className="text-center leading-normal text-foreground-muted">
        通过 SSH 隧道安全连接到你的 T3 Code 工作台。请选择由配置工具生成的连接文件。
      </Text>
      <View className="mt-2">
        <Button
          tone="primary"
          label="导入连接文件"
          loading={importAction.busy}
          onPress={() => void importAction.start()}
        />
      </View>
      {importAction.error ? (
        <Text textRole="footnote" className="text-center text-danger-foreground">
          {importAction.error}
        </Text>
      ) : null}
    </GateScaffold>
  );
}

export function SshConnectingScreen(props: { readonly profileName?: string | null }) {
  return (
    <GateScaffold>
      <AppActivityIndicator />
      <Text textRole="headline" className="text-center font-t3-medium text-foreground">
        正在连接工作台
      </Text>
      {props.profileName ? (
        <Text textRole="footnote" className="text-center text-foreground-muted">
          {props.profileName}
        </Text>
      ) : null}
    </GateScaffold>
  );
}

export function SshFailedScreen(props: { readonly message: string | null }) {
  const importAction = useEnrollmentImport();
  return (
    <GateScaffold>
      <Text textRole="title" className="text-center font-t3-bold text-foreground">
        连接失败
      </Text>
      <Text textRole="body" className="text-center leading-normal text-foreground-muted">
        {props.message ?? "连接失败，请稍后重试。"}
      </Text>
      <View className="mt-2 flex-row gap-3">
        <Button
          tone="primary"
          label="重试"
          disabled={importAction.busy}
          onPress={() => void sshTunnelController()?.retry()}
        />
        <Button
          tone="secondary"
          label="更换连接文件"
          loading={importAction.busy}
          onPress={() => void importAction.start()}
        />
      </View>
      {importAction.error ? (
        <Text textRole="footnote" className="text-center text-danger-foreground">
          {importAction.error}
        </Text>
      ) : null}
    </GateScaffold>
  );
}

/** Full-screen overlay shown above the mounted app while the tunnel reconnects. */
export function SshReconnectOverlay(props: {
  readonly failed: boolean;
  readonly message: string | null;
}) {
  return (
    <View collapsable={false} className="absolute inset-0 bg-screen">
      {props.failed ? <SshFailedScreen message={props.message} /> : <SshConnectingScreen />}
    </View>
  );
}

export function SshPairingCard(props: {
  readonly code: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onChangeCode: (code: string) => void;
  readonly onSubmit: () => void;
  readonly onSkip: () => void;
}) {
  return (
    <View collapsable={false} className="absolute inset-0 bg-screen">
      <GateScaffold>
        <Text textRole="title" className="text-center font-t3-bold text-foreground">
          配对工作台
        </Text>
        <Text textRole="body" className="text-center leading-normal text-foreground-muted">
          隧道已连接。请在 Mac 的 T3 Code 中生成配对码并输入，完成首次配对。
        </Text>
        <View collapsable={false} className="w-full max-w-80 gap-3">
          <AppTextInput
            accessibilityLabel="配对码"
            placeholder="配对码"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            value={props.code}
            onChangeText={props.onChangeCode}
            onSubmitEditing={props.onSubmit}
            className="rounded-2xl border border-border bg-grouped-card px-4 py-3 text-base"
          />
          {props.error ? (
            <Text textRole="footnote" className="text-center text-danger-foreground">
              {props.error}
            </Text>
          ) : null}
          <Button
            tone="primary"
            label="配对"
            fullWidth
            loading={props.busy}
            disabled={props.code.trim().length === 0}
            onPress={props.onSubmit}
          />
          <Button tone="text" label="稍后在设置中配对" onPress={props.onSkip} />
        </View>
      </GateScaffold>
    </View>
  );
}
