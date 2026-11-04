import { describe, expect, it } from "vite-plus/test";
import { splitMermaidMarkdown } from "./mermaidMarkdown";

describe("splitMermaidMarkdown", () => {
  it.each([
    "```mermaid\ngraph TD\nA-->B\n```",
    "``` mermaid\ngraph TD\nA-->B\n```",
    "~~~mermaid\ngraph TD\nA-->B\n~~~~",
    "  ````mermaid title\ngraph TD\nA-->B\n  ````",
    "```MERMAID\r\ngraph TD\r\nA-->B\r\n```",
  ])("recognizes a closed Mermaid fence and preserves surrounding Markdown: %s", (fence) => {
    const markdown = `# 中文标题\n\n${fence}\n\n![图片](./图.png)`;
    const segments = splitMermaidMarkdown(markdown);
    expect(segments.map((part) => part.text).join("")).toBe(markdown);
    expect(segments.map((part) => part.kind)).toEqual(["markdown", "mermaid", "markdown"]);
    expect(segments[1]).toMatchObject({ source: "graph TD\nA-->B" });
  });

  it.each([
    "```mermaid\ngraph TD\nA-->B",
    "````mermaid\ngraph TD\nA-->B\n```",
    "```mermaid\n```",
    "```js\nmermaid\n```",
    "```text\n```mermaid\ngraph TD\nA-->B\n```\n```",
    "> ```mermaid\n> graph TD\n> A-->B\n> ```",
    "- item\n\n  ```mermaid\n  graph TD\n  A-->B\n  ```",
  ])("keeps incomplete, empty, nested and unrelated fences as native Markdown: %s", (markdown) => {
    expect(splitMermaidMarkdown(markdown)).toEqual([
      { kind: "markdown", text: markdown, offset: 0 },
    ]);
  });

  it("handles multiple diagrams without losing prose or offsets", () => {
    const markdown =
      "```mermaid\ngraph TD\nA-->B\n```\n\n中文\n\n```mermaid\nsequenceDiagram\nA->>B: 你好\n```";
    const parts = splitMermaidMarkdown(markdown);
    expect(parts.map((part) => part.kind)).toEqual(["mermaid", "markdown", "mermaid"]);
    for (const part of parts)
      expect(markdown.slice(part.offset, part.offset + part.text.length)).toBe(part.text);
  });
  it("retains document-wide reference links in prose on either side of a diagram", () => {
    const markdown = "[文档][docs]\n\n```mermaid\ngraph TD\nA-->B\n```\n\n[docs]: ./中文.md";
    const parts = splitMermaidMarkdown(markdown);
    expect(parts[0]).toMatchObject({
      kind: "markdown",
      renderText: "[文档][docs]\n\n\n\n[docs]: ./中文.md",
    });
    expect(parts.map((part) => part.text).join("")).toBe(markdown);
  });
});
