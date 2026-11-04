import { useMemo } from "react";
import { splitMermaidMarkdown } from "../lib/mermaidMarkdown";
import { MermaidBlock } from "./MermaidBlock";
import { Platform } from "react-native";
import type { SelectableMarkdownTextProps } from "./SelectableMarkdownText.types";

import { MobileEnrichedMarkdownText } from "./EnrichedMarkdownText";
import { themeColorWithAlpha } from "../lib/mobileTheme";
import { useUniwindTheme } from "../lib/useUniwindTheme";

export type {
  MarkdownFileContextMenu,
  MarkdownFileContextMenuAction,
  MarkdownImageRenderer,
  MarkdownImageRequest,
  MarkdownImageSourceResolver,
  MarkdownLinkCustomization,
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
} from "./SelectableMarkdownText.types";

export function SelectableMarkdownText(props: SelectableMarkdownTextProps) {
  const theme = useUniwindTheme();
  const selectionColor = themeColorWithAlpha(theme["--color-focus"], 0.32);
  const selectionHandleColor = theme["--color-focus"];
  const textStyle =
    Platform.OS === "android"
      ? { selectionColor, selectionHandleColor, ...props.textStyle }
      : props.textStyle;
  const segments = useMemo(() => splitMermaidMarkdown(props.markdown), [props.markdown]);
  if (segments.length === 1 && segments[0]?.kind === "markdown") {
    return <MobileEnrichedMarkdownText {...props} textStyle={textStyle} />;
  }
  return segments.map((segment) =>
    segment.kind === "mermaid" ? (
      <MermaidBlock
        {...props}
        key={`${segment.offset}:${segment.source}`}
        markdown={segment.text}
        source={segment.source}
        textStyle={textStyle}
      />
    ) : (
      <MobileEnrichedMarkdownText
        {...props}
        key={segment.offset}
        markdown={segment.renderText ?? segment.text}
        textStyle={textStyle}
      />
    ),
  );
}
