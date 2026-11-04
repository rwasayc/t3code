import { useAtomValue } from "@effect/atom-react";
import type { ComponentProps } from "react";

import type { SettingsRow } from "../settings/components/SettingsRow";
import { isSshPersonalBuild } from "./ssh-build";
import { openSshSettings, sshTunnelSnapshotAtom } from "./ssh-runtime";
import { SSH_PHASE_LABELS } from "./SshSettingsModal";

export type SshSettingsListRow = ComponentProps<typeof SettingsRow> & { readonly id: string };

/**
 * The "工作台连接" row for the Settings connections section. Null unless this is the personal
 * Android SSH build, so the official app and iOS never see it.
 */
export function useSshTunnelSettingsRow(): SshSettingsListRow | null {
  const snapshot = useAtomValue(sshTunnelSnapshotAtom);
  if (!isSshPersonalBuild()) return null;
  return {
    id: "ssh-tunnel",
    icon: "server.rack",
    label: "工作台连接",
    value: snapshot.profile
      ? `${snapshot.profile.name} · ${SSH_PHASE_LABELS[snapshot.phase]}`
      : SSH_PHASE_LABELS[snapshot.phase],
    onPress: openSshSettings,
  };
}
