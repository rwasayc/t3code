import type { Code, Root, RootContent } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);

type SegmentSource = { readonly text: string; readonly offset: number };
export type MarkdownSegment = SegmentSource &
  (
    | { readonly kind: "markdown"; readonly renderText?: string }
    | { readonly kind: "mermaid"; readonly source: string; readonly renderText: string }
    | { readonly kind: "blockquote"; readonly children: readonly MarkdownSegment[] }
    | {
        readonly kind: "list";
        readonly items: readonly {
          readonly offset: number;
          readonly marker: string;
          readonly checked: boolean | null;
          readonly children: readonly MarkdownSegment[];
        }[];
      }
  );

export function splitMermaidMarkdown(markdown: string): readonly MarkdownSegment[] {
  if (!/mermaid/i.test(markdown)) return [{ kind: "markdown", text: markdown, offset: 0 }];
  const root = parser.parse(markdown);
  const definitions = root.children.filter((node) => node.type === "definition");
  const source = (node: RootContent): SegmentSource => ({
    text: markdown.slice(node.position!.start.offset!, node.position!.end.offset!),
    offset: node.position!.start.offset!,
  });
  const isDiagram = (node: RootContent): node is Code => {
    if (node.type !== "code" || node.lang?.toLowerCase() !== "mermaid" || !node.value.trim())
      return false;
    const text = source(node).text;
    const fence = /^(`{3,}|~{3,})/.exec(text)?.[1];
    // The AST accepts unfinished streaming fences; require an actual closing line.
    const closing = /(?:^|\n)(?:[ \t]*>[ \t]?)*[ \t]*(`{3,}|~{3,})[ \t]*\r?$/.exec(text)?.[1];
    return (
      !!fence &&
      !!closing &&
      closing[0] === fence[0] &&
      closing.length >= fence.length &&
      text.split(/\r\n?|\n/).length === node.value.split(/\r\n?|\n/).length + 2
    );
  };
  const containsDiagram = (node: RootContent): boolean =>
    isDiagram(node) ||
    ((node.type === "blockquote" || node.type === "list" || node.type === "listItem") &&
      node.children.some(containsDiagram));
  const serialize = (nodes: RootContent[]) =>
    parser.stringify({ type: "root", children: [...nodes, ...definitions] } as Root);
  const split = (
    nodes: RootContent[],
    nested: boolean,
    start: number,
    end: number,
  ): MarkdownSegment[] => {
    const segments: MarkdownSegment[] = [];
    let offset = start;
    let pending: RootContent[] = [];
    const flush = (until: number) => {
      if (until > offset) {
        const text = markdown.slice(offset, until);
        const renderText = nested
          ? serialize(pending)
          : definitions.length
            ? `${text}\n\n${definitions.map((node) => source(node).text).join("\n")}`
            : undefined;
        if (!nested || pending.length)
          segments.push({
            kind: "markdown",
            text,
            offset,
            ...(renderText === undefined ? {} : { renderText }),
          });
      }
      pending = [];
      offset = until;
    };
    for (const node of nodes) {
      if (!containsDiagram(node)) {
        pending.push(node);
        continue;
      }
      const original = source(node);
      flush(original.offset);
      if (isDiagram(node))
        segments.push({
          kind: "mermaid",
          ...original,
          source: node.value.replace(/\r\n?/g, "\n"),
          renderText: parser.stringify({ type: "root", children: [node] }),
        });
      else if (node.type === "blockquote")
        segments.push({
          kind: "blockquote",
          ...original,
          children: split(node.children, true, original.offset, node.position!.end.offset!),
        });
      else if (node.type === "list")
        segments.push({
          kind: "list",
          ...original,
          items: node.children.map((item, index) => ({
            offset: item.position!.start.offset!,
            marker: node.ordered ? `${(node.start ?? 1) + index}.` : "•",
            checked: item.checked ?? null,
            children: split(
              item.children,
              true,
              item.position!.start.offset!,
              item.position!.end.offset!,
            ),
          })),
        });
      offset = node.position!.end.offset!;
    }
    flush(end);
    return segments;
  };
  if (!root.children.some(containsDiagram))
    return [{ kind: "markdown", text: markdown, offset: 0 }];
  return split(root.children, false, 0, markdown.length);
}
