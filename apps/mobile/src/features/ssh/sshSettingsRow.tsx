import { useTranslation } from "../../lib/i18n/useTranslation";
import { useAtomValue } from "@effect/atom-react";
import type { ComponentProps } from "react";

import type { SettingsRow } from "../settings/components/SettingsRow";
import { isSshPersonalBuild } from "./ssh-build";
import { openSshSettings, sshTunnelSnapshotAtom } from "./ssh-runtime";
import { SSH_PHASE_LABELS } from "./SshSettingsModal";

export type SshSettingsListRow = ComponentProps<typeof SettingsRow> & { readonly id: string };

/**
 * The "Workbench connection" row for the Settings connections section. Null unless this is the personal
 * Android SSH build, so the official app and iOS never see it.
 */
export function useSshTunnelSettingsRow(): SshSettingsListRow | null {
  const { t } = useTranslation();
  const snapshot = useAtomValue(sshTunnelSnapshotAtom);
  if (!isSshPersonalBuild()) return null;
  return {
    id: "ssh-tunnel",
    icon: "server.rack",
    label: t("Workbench connection"),
    value: snapshot.profile
      ? `${snapshot.profile.name} · ${t(SSH_PHASE_LABELS[snapshot.phase])}`
      : t(SSH_PHASE_LABELS[snapshot.phase]),
    onPress: openSshSettings,
  };
}
