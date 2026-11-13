import { App as LabControlApp } from "@carvebloom/lab-control-ui";
import "@carvebloom/lab-control-ui/style.css";
import { useNavigate } from "@tanstack/react-router";

import { useTheme } from "../../hooks/useTheme";
import { readThreadShell } from "../../state/entities";
import { buildThreadRouteParams } from "../../threadRoutes";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { createUnavailableT3HostAdapter } from "./T3HostAdapter";
import "./projectControl.css";

export function ProjectControlPage() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const host = createUnavailableT3HostAdapter(resolvedTheme, {
    canOpenThread: (ref) => readThreadShell(ref) !== null,
    openThread: (ref) => {
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
    },
  });

  return (
    <AppRouteModal label="Project control">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b ps-5 pe-2">
          <h1 className="text-sm font-medium">Project control</h1>
          <AppRouteModalClose />
        </header>
        <div data-project-control className="min-h-0 flex-1 overflow-auto">
          <p role="status" className="px-6 pt-4 text-sm text-muted-foreground">
            Project data is unavailable. A backend instance and read access have not been
            configured.
          </p>
          <LabControlApp host={host} />
        </div>
      </div>
    </AppRouteModal>
  );
}
