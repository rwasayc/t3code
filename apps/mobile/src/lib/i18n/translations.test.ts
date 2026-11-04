import { describe, expect, it } from "vite-plus/test";
import { resolveAppLanguage, translate } from "./translations";

describe("app language", () => {
  it.each(["zh-CN", "zh-Hans-CN", "zh_TW", "zh"])(
    "follows a Chinese system locale: %s",
    (locale) => {
      expect(resolveAppLanguage("system", locale)).toBe("zh-CN");
      expect(resolveAppLanguage("en", locale)).toBe("en");
    },
  );
  it("uses explicit preferences and falls back to English for other system languages", () => {
    expect(resolveAppLanguage("zh-CN", "en-US")).toBe("zh-CN");
    expect(resolveAppLanguage(undefined, "fr-FR")).toBe("en");
    expect(resolveAppLanguage(undefined, "")).toBe("en");
  });
  it("falls back to authored copy and interpolates values without translating their contents", () => {
    expect(translate("en", "Settings")).toBe("Settings");
    expect(translate("en", "Tap ")).toBe("Tap ");
    expect(translate("zh-CN", "Tap ")).toBe("点按");
    expect(translate("zh-CN", "Settings")).toBe("设置");
    expect(translate("zh-CN", "Untranslated message")).toBe("Untranslated message");
    expect(translate("zh-CN", "No settings match “{query}”.", { query: "Settings" })).toBe(
      "没有与“Settings”匹配的设置。",
    );
    expect(translate("en", "{value} {missing}", { value: "$& <中文>" })).toBe(
      "$& <中文> {missing}",
    );
  });
});
