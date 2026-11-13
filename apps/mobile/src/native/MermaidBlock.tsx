import { useMemo, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import mermaidScript from "@t3tools/mobile-mermaid";

import { AppText } from "../components/ui/AppText";
import { ControlPill } from "../components/ui/ControlPill";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { useTranslation } from "../lib/i18n/useTranslation";
import { mermaidHtml, parseMermaidMessage } from "../lib/mermaidHtml";
import { MobileEnrichedMarkdownText } from "./EnrichedMarkdownText";
import type { SelectableMarkdownTextProps } from "./SelectableMarkdownText.types";

function MermaidSurface({
  source,
  expanded,
  onError,
  onReady,
  onExpand,
}: {
  readonly source: string;
  readonly expanded?: boolean;
  readonly onError: () => void;
  readonly onReady?: () => void;
  readonly onExpand?: () => void;
}) {
  const { t } = useTranslation();
  const { themeAppearance, mathRenderingEnabled } = useAppearancePreferences();
  const [height, setHeight] = useState(180);
  const zoomIn = t("Zoom in");
  const zoomOut = t("Zoom out");
  const reset = t("Fit to screen");
  const html = useMemo(
    () =>
      mermaidHtml(source, mermaidScript, themeAppearance === "dark", {
        expanded,
        mathEnabled: mathRenderingEnabled,
        labels: { zoomIn, zoomOut, reset },
      }),
    [source, themeAppearance, expanded, mathRenderingEnabled, zoomIn, zoomOut, reset],
  );
  return (
    <WebView
      source={{ html }}
      style={
        expanded
          ? { flex: 1, backgroundColor: "transparent" }
          : { height, backgroundColor: "transparent" }
      }
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
      onError={onError}
      onContentProcessDidTerminate={onError}
      onRenderProcessGone={onError}
      onMessage={(event) => {
        const message = parseMermaidMessage(event.nativeEvent.data);
        if (message?.kind === "error") onError();
        else if (message?.kind === "height") setHeight(message.height);
        else if (message?.kind === "ready") onReady?.();
        else if (message?.kind === "expand") onExpand?.();
      }}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      allowsInlineMediaPlayback={false}
      setSupportMultipleWindows={false}
      scrollEnabled={!expanded}
      nestedScrollEnabled={!expanded}
      accessibilityLabel={t("Mermaid diagram")}
    />
  );
}

export function MermaidBlock(props: SelectableMarkdownTextProps & { readonly source: string }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [showCode, setShowCode] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const fail = () => {
    setFailed(true);
    setReady(false);
  };
  const retryOrToggle = () => {
    if (failed) {
      setFailed(false);
      setShowCode(false);
    } else setShowCode((value) => !value);
    setReady(false);
  };
  const controls = (
    <View className="flex-row flex-wrap justify-end gap-2">
      {!showCode && !failed ? (
        <ControlPill
          label={t("Expand diagram")}
          variant="pill"
          disabled={!ready}
          onPress={() => setExpanded(true)}
        />
      ) : null}
      <ControlPill
        label={t(failed ? "Retry diagram" : showCode ? "Show diagram" : "Show code")}
        variant="pill"
        onPress={retryOrToggle}
      />
    </View>
  );
  return (
    <View className="my-2 gap-2">
      {controls}
      {failed ? (
        <AppText>{t("Unable to render diagram. The source is shown below.")}</AppText>
      ) : null}
      {showCode || failed ? (
        <MobileEnrichedMarkdownText {...props} />
      ) : (
        <MermaidSurface
          source={props.source}
          onError={fail}
          onReady={() => setReady(true)}
          onExpand={() => setExpanded(true)}
        />
      )}
      <Modal
        visible={expanded}
        onRequestClose={() => setExpanded(false)}
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
        animationType="fade"
      >
        <View
          className="flex-1 bg-screen"
          style={{
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
        >
          <View className="flex-row items-center justify-between gap-2 px-3 py-2">
            <AppText>{t("Mermaid diagram")}</AppText>
            <ControlPill
              label={t("Close diagram")}
              variant="pill"
              onPress={() => setExpanded(false)}
            />
          </View>
          {failed ? (
            <ScrollView className="flex-1 px-3">
              <AppText>{t("Unable to render diagram. The source is shown below.")}</AppText>
              <MobileEnrichedMarkdownText {...props} />
              <ControlPill
                label={t("Retry diagram")}
                variant="pill"
                onPress={() => setFailed(false)}
              />
            </ScrollView>
          ) : (
            <MermaidSurface source={props.source} expanded onError={fail} />
          )}
        </View>
      </Modal>
    </View>
  );
}
