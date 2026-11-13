import type { HostAdapterV1, ThemeTokensV1 } from "@carvebloom/lab-control-ui";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { parseThreadLinkHref } from "@t3tools/shared/threadLinks";

const readUnavailablePortfolio: HostAdapterV1["readPortfolio"] = (signal) =>
  Promise.reject(new Error(signal.aborted ? "request_cancelled" : "backend_unavailable"));

export function createUnavailableT3HostAdapter(
  mode: ThemeTokensV1["mode"],
  navigation: {
    canOpenThread: (ref: ScopedThreadRef) => boolean;
    openThread: (ref: ScopedThreadRef) => void;
  },
): HostAdapterV1 {
  return {
    contractVersion: "1",
    kind: "t3",
    binding: {
      t3EnvironmentId: null,
      backendInstanceId: "unconfigured",
      bindingRevision: "unconfigured",
      apiVersion: "1",
    },
    theme: {
      mode,
      background: "var(--background)",
      surface: "var(--card)",
      foreground: "var(--foreground)",
      muted: "var(--muted-foreground)",
      border: "var(--border)",
      accent: "var(--primary)",
      success: "var(--success)",
      danger: "var(--destructive)",
    },
    readPortfolio: readUnavailablePortfolio,
    openThread: (href) => {
      const written = href.trim();
      const link = parseThreadLinkHref(
        written.startsWith("<") && written.endsWith(">") ? written.slice(1, -1) : written,
      );
      if (link?.environmentId == null) return;
      const ref = { environmentId: link.environmentId, threadId: link.threadId };
      if (navigation.canOpenThread(ref)) navigation.openThread(ref);
    },
  };
}
