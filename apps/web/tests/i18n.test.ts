import { describe, expect, it } from "vitest";
import { defaultLanguage, getCopy, getStatusLabel, languages } from "../src/i18n";

describe("i18n", () => {
  it("defaults to simplified Chinese", () => {
    expect(defaultLanguage).toBe("zh-CN");
    expect(getCopy(defaultLanguage).appTitle).toBe("状态叠层生成器");
  });

  it("provides localized status labels", () => {
    expect(getCopy("zh-CN").statusLabels.mood).toBe("心情");
    expect(getCopy("en-US").statusLabels.mood).toBe("Mood");
    expect(Object.keys(getCopy("zh-CN").statusLabels)).toEqual(["mood", "fatigue", "hunger"]);
    expect(Object.keys(getCopy("en-US").statusLabels)).toEqual(["mood", "fatigue", "hunger"]);
  });

  it("prefers custom status labels over localized defaults", () => {
    expect(getStatusLabel(getCopy("zh-CN"), "mood", "心情", " 快乐值 ")).toBe("快乐值");
    expect(getStatusLabel(getCopy("en-US"), "mood", "心情", "快乐值")).toBe("快乐值");
    expect(getStatusLabel(getCopy("en-US"), "mood", "心情", "   ")).toBe("Mood");
  });

  it("provides localized engine errors", () => {
    expect(getCopy("zh-CN").errors.wholeNumber).toContain("+5");
    expect(getCopy("en-US").errors.nonZeroDelta).toBe("Delta cannot be 0.");
  });

  it("lists supported language choices", () => {
    expect(languages).toEqual([
      { id: "zh-CN", label: "中文" },
      { id: "en-US", label: "English" },
    ]);
  });
});
