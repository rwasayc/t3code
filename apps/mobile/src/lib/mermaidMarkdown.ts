import { unified } from "unified";
import remarkParse from "remark-parse";

const parser = unified().use(remarkParse);

type MarkdownSegment =
  | {
      readonly kind: "markdown";
      readonly text: string;
      readonly offset: number;
      readonly renderText?: string;
    }
  | {
      readonly kind: "mermaid";
      readonly text: string;
      readonly source: string;
      readonly offset: number;
    };

export function splitMermaidMarkdown(markdown: string): readonly MarkdownSegment[] {
  if (!/^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid(?:\s|$)/im.test(markdown)) {
    return [{ kind: "markdown", text: markdown, offset: 0 }];
  }
  const segments: MarkdownSegment[] = [];
  let offset = 0;
  const root = parser.parse(markdown);
  for (const node of root.children) {
    if (node.type !== "code" || node.lang?.toLowerCase() !== "mermaid") continue;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    const text = markdown.slice(start, end);
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    // Incomplete streaming fences stay native code until their closing fence arrives.
    if (!fence || !new RegExp(`\\n {0,3}${fence[0]}{${fence.length},}[ \\t]*\\r?$`).test(text))
      continue;
    if (!node.value.trim()) continue;
    if (start > offset)
      segments.push({ kind: "markdown", text: markdown.slice(offset, start), offset });
    segments.push({
      kind: "mermaid",
      text,
      source: node.value.replace(/\r\n?/g, "\n"),
      offset: start,
    });
    offset = end;
  }
  if (offset < markdown.length || segments.length === 0) {
    segments.push({ kind: "markdown", text: markdown.slice(offset), offset });
  }
  if (!segments.some((segment) => segment.kind === "mermaid")) return segments;
  const definitions = root.children
    .filter((node) => node.type === "definition")
    .map((node) => markdown.slice(node.position!.start.offset, node.position!.end.offset))
    .join("\n");
  return definitions
    ? segments.map((segment) =>
        segment.kind === "markdown"
          ? { ...segment, renderText: `${segment.text}\n\n${definitions}` }
          : segment,
      )
    : segments;
}
