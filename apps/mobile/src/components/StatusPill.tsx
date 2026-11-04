import { useTranslation } from "../lib/i18n/useTranslation";
import { View } from "react-native";

import { AppText as Text } from "./ui/AppText";
import { cn } from "../lib/cn";

export interface StatusTone {
  readonly label: string;
  readonly pillClassName: string;
  readonly textClassName: string;
}

export function StatusPill(
  props: StatusTone & {
    readonly size?: "default" | "compact";
  },
) {
  const { t } = useTranslation();
  const size = props.size ?? "default";
  return (
    <View
      className={cn(
        "rounded-full",
        size === "compact" ? "px-2.5 py-1" : "px-3 py-1.5",
        props.pillClassName,
      )}
    >
      <Text
        className={cn(
          "font-t3-bold",
          size === "compact" ? "text-2xs" : "text-xs",
          props.textClassName,
        )}
      >
        {t(props.label)}
      </Text>
    </View>
  );
}
