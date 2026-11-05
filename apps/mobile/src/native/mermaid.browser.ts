/* oxlint-disable unicorn/require-post-message-target-origin -- React Native WebView's bridge takes only a message, without a browser target origin. */
import {
  createMermaidMathResolver,
  sanitizeDiagramSvg,
  sanitizeMathDiagramSvg,
} from "../lib/mermaidMath";
import { mount } from "pele";
import type { MermaidOptions } from "../lib/mermaidHtml";

const root = document.getElementById("diagram")!;
const source = document.getElementById("source")!.textContent!;
const options: MermaidOptions = JSON.parse(document.getElementById("options")!.textContent!);
const bridge = (
  window as Window & { ReactNativeWebView?: { postMessage: (message: string) => void } }
).ReactNativeWebView;
const reportHeight = () =>
  bridge?.postMessage(
    JSON.stringify({ height: Math.ceil(root.getBoundingClientRect().height) + 16 }),
  );
new ResizeObserver(reportHeight).observe(root);
if (!options.expanded)
  root.addEventListener("click", () => bridge?.postMessage(JSON.stringify({ expand: true })));
try {
  mount(root, source, {
    links: false,
    images: false,
    zoom: options.expanded ? { always: true, controls: true, labels: options.labels } : false,
    autoDirection: false,
    ...(options.mathEnabled && source.includes("$$")
      ? { math: createMermaidMathResolver(), sanitize: sanitizeMathDiagramSvg }
      : { sanitize: sanitizeDiagramSvg }),
    onError: () => bridge?.postMessage(JSON.stringify({ error: true })),
    onRender: () => {
      reportHeight();
      bridge?.postMessage(JSON.stringify({ ready: true }));
    },
  });
} catch {
  bridge?.postMessage(JSON.stringify({ error: true }));
}
