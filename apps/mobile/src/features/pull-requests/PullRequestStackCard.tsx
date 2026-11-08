import { useTranslation } from "../../lib/i18n/useTranslation";
import { useState } from "react";
import { View } from "react-native";
import { useOpenWorkspaceDetail } from "../layout/useOpenWorkspaceDetail";
import { AppText as Text } from "../../components/ui/AppText";
import { PullRequestCardGroup, PullRequestCardRow } from "./PullRequestControls";
import { pullRequestLayerParams } from "./pullRequestStack";
import { pullRequestStatus } from "./pullRequestStatus";
import type { PullRequestParams } from "./usePullRequestDiff";
import type { PullRequestStackState } from "./usePullRequestStack";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import { withKnownPullRequestSummary } from "../../state/use-thread-pr";

export function PullRequestStackCard(props: {
  readonly params: PullRequestParams;
  readonly state: PullRequestStackState;
}) {
  const { t } = useTranslation();
  const openDetail = useOpenWorkspaceDetail();
  const [expanded, setExpanded] = useState(false);
  const stack = props.state.stack;
  if (!stack) {
    const summary =
      props.params.initialSummary?.number === props.params.number
        ? props.params.initialSummary.stack
        : undefined;
    if (!summary) return null;
    return (
      <PullRequestCardGroup>
        <PullRequestCardRow
          title={t("Stack")}
          icon={PullRequestGlyph.stack}
          value={`${summary.position} of ${summary.size}`}
          last
        />
      </PullRequestCardGroup>
    );
  }
  const position = stack.layers.findIndex((layer) => layer.number === props.params.number) + 1;
  return (
    <PullRequestCardGroup>
      <PullRequestCardRow
        title={t("Stack")}
        icon={PullRequestGlyph.stack}
        value={`${position} of ${stack.layers.length}`}
        accessibilityLabel={t("Stack, {position} of {length}{value2}", {
          position: String(position),
          length: String(stack.layers.length),
          value2: String(props.state.isFresh ? "" : ", showing saved stack"),
        })}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        last={!expanded}
      />
      {expanded ? (
        <View>
          {stack.layers.map((layer, index) => {
            const selected = layer.number === props.params.number;
            const status = pullRequestStatus({
              state: layer.state,
              isDraft: layer.isDraft === true,
            });
            return (
              <View key={layer.number} className={selected ? "bg-thread-selected" : undefined}>
                <PullRequestCardRow
                  title={layer.title ?? layer.headBranch}
                  icon={status.icon}
                  tint={status.tint}
                  value={selected ? "Current" : status.label}
                  detail={t("#{number} · {value1} of {length}", {
                    number: String(layer.number),
                    value1: String(index + 1),
                    length: String(stack.layers.length),
                  })}
                  onPress={
                    selected
                      ? undefined
                      : () =>
                          openDetail({
                            name: "PullRequest",
                            params: withKnownPullRequestSummary(
                              pullRequestLayerParams(props.params, layer.number),
                            ),
                          })
                  }
                  last={index === stack.layers.length - 1}
                />
              </View>
            );
          })}
          <Text className="px-4 py-3 text-xs text-foreground-muted">
            {t("Base: ")}
            {stack.base}
            {t(". Open a layer to review it or merge the stack through that layer.")}
          </Text>
        </View>
      ) : null}
    </PullRequestCardGroup>
  );
}
