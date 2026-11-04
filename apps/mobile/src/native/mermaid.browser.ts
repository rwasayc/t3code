/* oxlint-disable unicorn/require-post-message-target-origin -- React Native WebView's bridge takes only a message, without a browser target origin. */
import DOMPurify from "dompurify";
import { mount } from "pele";

const root = document.getElementById("diagram")!;
const source = document.getElementById("source")!.textContent!;
const bridge = (
  window as Window & { ReactNativeWebView?: { postMessage: (message: string) => void } }
).ReactNativeWebView;
const reportHeight = () =>
  bridge?.postMessage(
    JSON.stringify({ height: Math.ceil(root.getBoundingClientRect().height) + 16 }),
  );
new ResizeObserver(reportHeight).observe(root);
try {
  mount(root, source, {
    links: false,
    images: false,
    zoom: false,
    autoDirection: false,
    sanitize: (svg) =>
      DOMPurify.sanitize(svg, {
        FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
        FORBID_TAGS: ["a", "image", "foreignObject", "style"],
        USE_PROFILES: { svg: true, svgFilters: true },
        RETURN_DOM_FRAGMENT: true,
      }),
    onError: () => bridge?.postMessage(JSON.stringify({ error: true })),
    onRender: reportHeight,
  });
} catch {
  bridge?.postMessage(JSON.stringify({ error: true }));
}
