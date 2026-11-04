import { expect, it } from "vite-plus/test";
import { mermaidHtml, parseMermaidMessage } from "./mermaidHtml";

it("keeps diagram text inert even when it contains HTML or closing script tags", () => {
  const html = mermaidHtml(
    'graph TD\nA["</pre><script>alert(1)</script>& 中文"]',
    'const x = "</script>";',
    true,
  );
  expect(html).toContain("&lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp; 中文");
  expect(html.match(/<script>/g)).toHaveLength(1);
  expect(html.match(/<\/script>/g)).toHaveLength(1);
  expect(html).toContain("default-src 'none'");
});

it.each([
  ['{"height":240}', { kind: "height", height: 240 }],
  ['{"height":-10}', { kind: "height", height: 80 }],
  ['{"height":50000}', { kind: "height", height: 4000 }],
  ['{"error":true}', { kind: "error" }],
  ["invalid json", { kind: "error" }],
  ['{"height":"240"}', null],
  ['{"height":1e999}', null],
  ["null", null],
  ['{"unrecognized":true}', null],
])("validates and bounds native bridge messages: %s", (data, expected) => {
  expect(parseMermaidMessage(data)).toEqual(expected);
});
