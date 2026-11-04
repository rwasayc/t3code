import { View } from "react-native";
import { ListChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { useTranslation } from "../../../../lib/i18n/useTranslation";
import { SettingsSection } from "../../components/SettingsSection";

export function LanguageSection() {
  const { t, preference, ready, setLanguage } = useTranslation();
  return (
    <SettingsSection
      title={t("Language")}
      footer={t("Language changes apply immediately and are saved on this device.")}
    >
      <View accessibilityRole="radiogroup">
        <ListChoiceRow
          label={t("Follow system")}
          selected={preference === "system"}
          disabled={!ready}
          onPress={() => setLanguage("system")}
        />
        <ListChoiceRow
          label="简体中文"
          selected={preference === "zh-CN"}
          disabled={!ready}
          onPress={() => setLanguage("zh-CN")}
          separated
        />
        <ListChoiceRow
          label="English"
          selected={preference === "en"}
          disabled={!ready}
          onPress={() => setLanguage("en")}
          separated
        />
      </View>
    </SettingsSection>
  );
}
