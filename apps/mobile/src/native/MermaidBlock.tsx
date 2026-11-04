import { useMemo, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import mermaidScript from "@t3tools/mobile-mermaid";

import { AppText } from "../components/ui/AppText";
import { ControlPill } from "../components/ui/ControlPill";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { mermaidHtml, parseMermaidMessage } from "../lib/mermaidHtml";
import { MobileEnrichedMarkdownText } from "./EnrichedMarkdownText";
import type { SelectableMarkdownTextProps } from "./SelectableMarkdownText.types";

export function MermaidBlock(props: SelectableMarkdownTextProps & { readonly source: string }) {
  const { themeAppearance } = useAppearancePreferences();
  const [showCode, setShowCode] = useState(false);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(180);
  const html = useMemo(
    () => mermaidHtml(props.source, mermaidScript, themeAppearance === "dark"),
    [props.source, themeAppearance],
  );
  return (
    <View className="my-2 gap-2">
      <View className="flex-row justify-end">
        <ControlPill
          label={failed ? "Retry diagram" : showCode ? "Show diagram" : "Show code"}
          variant="pill"
          onPress={() => {
            if (failed) {
              setFailed(false);
              setShowCode(false);
            } else setShowCode((value) => !value);
          }}
        />
      </View>
      {failed ? <AppText>Unable to render diagram. The source is shown below.</AppText> : null}
      {showCode || failed ? (
        <MobileEnrichedMarkdownText {...props} />
      ) : (
        <WebView
          source={{ html }}
          style={{ height, backgroundColor: "transparent" }}
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
          onError={() => setFailed(true)}
          onMessage={(event) => {
            const message = parseMermaidMessage(event.nativeEvent.data);
            if (message?.kind === "error") setFailed(true);
            else if (message?.kind === "height") setHeight(message.height);
          }}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowsInlineMediaPlayback={false}
          setSupportMultipleWindows={false}
          scrollEnabled
          nestedScrollEnabled
        />
      )}
    </View>
  );
}
