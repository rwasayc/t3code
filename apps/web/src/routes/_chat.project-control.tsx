import { createFileRoute } from "@tanstack/react-router";

import { ProjectControlPage } from "../components/projectControl/ProjectControlPage";

export const Route = createFileRoute("/_chat/project-control")({
  component: ProjectControlPage,
});
