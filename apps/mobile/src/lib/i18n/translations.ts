import { ZH_CN } from "./zh-CN";

export type AppLanguage = "system" | "en" | "zh-CN";
export type ResolvedLanguage = Exclude<AppLanguage, "system">;

export function resolveAppLanguage(
  preference: AppLanguage | undefined,
  systemLocale: string,
): ResolvedLanguage {
  if (preference === "en" || preference === "zh-CN") return preference;
  return /^zh(?:[-_]|$)/i.test(systemLocale) ? "zh-CN" : "en";
}

export function translate(
  language: ResolvedLanguage,
  message: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const translated =
    language === "zh-CN" ? (ZH_CN[message] ?? ZH_CN[message.trim()] ?? message) : message;
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
