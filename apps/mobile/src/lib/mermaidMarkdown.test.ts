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
    "```mermaid\ngraph TD\nA-->B\n> ```",
    "```text\n```mermaid\ngraph TD\nA-->B\n```\n```",
  ])("keeps incomplete, empty and unrelated fences as native Markdown: %s", (markdown) => {
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

it("retains numbered and task lists, nested quotes, tables and reference links around diagrams", () => {
  const markdown =
    "3. [x] [文档][docs]\n\n   > 说明\n   >\n   > ```mermaid\n   > graph TD\n   > A-->B\n   > ```\n   >\n   > | A | B |\n   > | - | - |\n   > | C | D |\n\n4. next\n\n[docs]: ./中文.md";
  const parts = splitMermaidMarkdown(markdown);
  expect(parts.map((part) => part.text).join("")).toBe(markdown);
  const list = parts[0];
  expect(list?.kind).toBe("list");
  if (list?.kind !== "list") throw new Error("missing list");
  expect(list.items.map((item) => item.marker)).toEqual(["3.", "4."]);
  expect(list.items[0]?.checked).toBe(true);
  expect(list.items[0]?.children[0]).toMatchObject({
    kind: "markdown",
    renderText: expect.stringContaining("[docs]: ./中文.md"),
  });
  const quote = list.items[0]?.children[1];
  expect(quote?.kind).toBe("blockquote");
  if (quote?.kind !== "blockquote") throw new Error("missing quote");
  expect(quote.children.map((child) => child.kind)).toEqual(["markdown", "mermaid", "markdown"]);
  expect(quote.children[1]).toMatchObject({ source: "graph TD\nA-->B" });
  expect(quote.children[2]).toMatchObject({ renderText: expect.stringContaining("| A | B |") });
  expect(list.items[1]?.children[0]).toMatchObject({ renderText: expect.stringContaining("next") });
});

it.each([
  "> ```mermaid\n> graph TD\n> A-->B",
  "1. item\n\n   ````mermaid\n   graph TD\n   A-->B\n   ```",
  "    ```mermaid\n    graph TD\n    A-->B\n    ```",
])("keeps unfinished nested fences and indented code intact: %s", (markdown) => {
  expect(splitMermaidMarkdown(markdown)).toEqual([{ kind: "markdown", text: markdown, offset: 0 }]);
});

it("updates a quoted streaming fence only after it closes", () => {
  const start = "> ~~~mermaid\r\n> graph TD\r\n> A-->B";
  expect(splitMermaidMarkdown(start)[0]?.kind).toBe("markdown");
  const closed = splitMermaidMarkdown(start + "\r\n> ~~~~")[0];
  expect(closed?.kind).toBe("blockquote");
  if (closed?.kind === "blockquote")
    expect(closed.children[0]).toMatchObject({ kind: "mermaid", source: "graph TD\nA-->B" });
});

it("keeps literal fences inside the source fallback as code", () => {
  const diagram = splitMermaidMarkdown("````mermaid\ngraph TD\n```\nA-->B\n````")[0];
  expect(diagram?.kind).toBe("mermaid");
  if (diagram?.kind !== "mermaid") throw new Error("missing diagram");
  expect(diagram.renderText).toBe("````mermaid\ngraph TD\n```\nA-->B\n````\n");
});
