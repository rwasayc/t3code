import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { resolveAppLanguage, translate, type AppLanguage } from "./translations";
import { TranslationContext } from "./useTranslation";

function subscribeSystemLocale(onChange: () => void) {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") onChange();
  });
  return () => subscription.remove();
}

const systemLocale = () => Intl.DateTimeFormat().resolvedOptions().locale;

export function TranslationProvider(props: { readonly children: ReactNode }) {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom);
  const preference = AsyncResult.isSuccess(preferences)
    ? (preferences.value.appLanguage ?? "system")
    : "system";
  const locale = useSyncExternalStore(subscribeSystemLocale, systemLocale);
  const language = Platform.OS === "android" ? resolveAppLanguage(preference, locale) : "en";
  const ready = AsyncResult.isSuccess(preferences) && !preferences.waiting;
  const value = useMemo(
    () => ({
      language,
      preference,
      ready,
      setLanguage: (appLanguage: AppLanguage) => save({ appLanguage }),
      t: (message: string, values?: Readonly<Record<string, string | number>>) =>
        translate(language, message, values),
    }),
    [language, preference, ready, save],
  );
  return <TranslationContext value={value}>{props.children}</TranslationContext>;
}
