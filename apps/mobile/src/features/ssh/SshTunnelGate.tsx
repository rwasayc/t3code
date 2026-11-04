import type { ReactNode } from "react";

/**
 * Non-Android surfaces never see the tunnel gate; the real implementation is in
 * SshTunnelGate.android.tsx and additionally self-disables on non-personal builds.
 */
export function SshTunnelGate({ children }: { readonly children: ReactNode }) {
  return children;
}
