function htmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export interface MermaidOptions {
  readonly expanded?: boolean;
  readonly mathEnabled?: boolean;
  readonly labels?: { readonly zoomIn: string; readonly zoomOut: string; readonly reset: string };
}

export function mermaidHtml(
  source: string,
  script: string,
  dark: boolean,
  options: MermaidOptions = {},
): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><style>
html,body{margin:0;padding:0;background:transparent;color:${dark ? "#eee" : "#222"};font-family:system-ui,sans-serif;color-scheme:${dark ? "dark" : "light"}}
body{padding:8px;box-sizing:border-box}#diagram{width:100%;overflow:auto}svg{max-width:100%;height:auto;--pele-bg:${dark ? "#18181b" : "#fff"};--pele-fg:${dark ? "#eee" : "#222"};--pele-line:${dark ? "#aaa" : "#555"};--pele-muted:${dark ? "#aaa" : "#666"};--pele-surface:${dark ? "#27272a" : "#f4f4f5"};--pele-accent:#818cf8}
${options.expanded ? "html,body{height:100%;overflow:hidden}body{padding:0}#diagram{height:100%;touch-action:none;overflow:hidden}" : ""}
</style></head><body><div id="diagram"></div><pre id="source" hidden>${htmlText(source)}</pre><pre id="options" hidden>${htmlText(JSON.stringify(options))}</pre><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
}

export function parseMermaidMessage(
  data: string,
):
  | { readonly kind: "error" }
  | { readonly kind: "height"; readonly height: number }
  | { readonly kind: "ready" }
  | { readonly kind: "expand" }
  | null {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return { kind: "error" };
  }
  if (typeof message !== "object" || message === null) return null;
  if ("error" in message && message.error === true) return { kind: "error" };
  if ("expand" in message && message.expand === true) return { kind: "expand" };
  if ("ready" in message && message.ready === true) return { kind: "ready" };
  if (
    "height" in message &&
    typeof message.height === "number" &&
    Number.isFinite(message.height)
  ) {
    return { kind: "height", height: Math.min(4000, Math.max(80, message.height)) };
  }
  return null;
}
