import { createContext, use } from "react";
import { translate, type AppLanguage, type ResolvedLanguage } from "./translations";

export const TranslationContext = createContext<{
  readonly language: ResolvedLanguage;
  readonly preference: AppLanguage;
  readonly ready: boolean;
  readonly setLanguage: (language: AppLanguage) => void;
  readonly t: (message: string, values?: Readonly<Record<string, string | number>>) => string;
}>({
  language: "en",
  preference: "system",
  ready: false,
  setLanguage: () => {},
  t: (message, values) => translate("en", message, values),
});

export function useTranslation() {
  return use(TranslationContext);
}
