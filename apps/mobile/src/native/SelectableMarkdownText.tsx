import { useMemo } from "react";
import { splitMermaidMarkdown, type MarkdownSegment } from "../lib/mermaidMarkdown";
import { MermaidBlock } from "./MermaidBlock";
import { Platform, View } from "react-native";
import type { SelectableMarkdownTextProps } from "./SelectableMarkdownText.types";

import { MobileEnrichedMarkdownText } from "./EnrichedMarkdownText";
import { AppText } from "../components/ui/AppText";
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
  return <MarkdownSegments segments={segments} markdownProps={{ ...props, textStyle }} />;
}

function MarkdownSegments({
  segments,
  markdownProps: props,
}: {
  readonly segments: readonly MarkdownSegment[];
  readonly markdownProps: SelectableMarkdownTextProps;
}) {
  return segments.map((segment) => {
    const key = `${segment.kind}:${segment.offset}${segment.kind === "mermaid" ? `:${segment.source}` : ""}`;
    if (segment.kind === "mermaid")
      return (
        <MermaidBlock {...props} key={key} markdown={segment.renderText} source={segment.source} />
      );
    if (segment.kind === "blockquote")
      return (
        <View
          key={key}
          style={{
            borderStartWidth: 2,
            borderStartColor: props.textStyle.quoteMarkerColor,
            paddingStart: 12,
            marginVertical: 4,
          }}
        >
          <MarkdownSegments segments={segment.children} markdownProps={props} />
        </View>
      );
    if (segment.kind === "list")
      return (
        <View key={key}>
          {segment.items.map((item) => (
            <View
              key={item.offset}
              style={{ flexDirection: "row", alignItems: "flex-start", marginVertical: 4 }}
            >
              <AppText
                style={{
                  color: props.textStyle.mutedColor,
                  fontSize: props.textStyle.fontSize,
                  lineHeight: props.textStyle.lineHeight,
                  minWidth: 28,
                  paddingEnd: 8,
                }}
              >
                {item.checked === null ? item.marker : item.checked ? "☑" : "☐"}
              </AppText>
              <View style={{ flex: 1, minWidth: 0 }}>
                <MarkdownSegments segments={item.children} markdownProps={props} />
              </View>
            </View>
          ))}
        </View>
      );
    return (
      <MobileEnrichedMarkdownText
        {...props}
        key={key}
        markdown={segment.renderText ?? segment.text}
      />
    );
  });
}
