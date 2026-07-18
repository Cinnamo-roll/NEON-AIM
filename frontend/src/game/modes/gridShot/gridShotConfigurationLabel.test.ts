import { afterEach, describe, expect, it } from "vitest";
import { setAppLanguage } from "../../../i18n";
import {
  formatGridShotConfigurationLabel,
  formatGridShotTargetSizeLabel,
} from "./gridShotConfigurationLabel";

describe("Grid Shot configuration labels", () => {
  afterEach(() => setAppLanguage("zh-CN"));

  it("shows localized Chinese labels without exposing internal enum values", () => {
    setAppLanguage("zh-CN");

    expect(formatGridShotConfigurationLabel("grid-shot:60s:medium")).toBe("60 秒 · 中目标");
    expect(formatGridShotConfigurationLabel("grid-shot:90s:large")).toBe("90 秒 · 大目标");
    expect(formatGridShotTargetSizeLabel("legacy-local")).toBe("未知目标");
  });

  it("switches the complete configuration label to English", () => {
    setAppLanguage("en-US");

    expect(formatGridShotConfigurationLabel("grid-shot:30s:small")).toBe("30s · Small targets");
    expect(formatGridShotConfigurationLabel("grid-shot:60s:medium")).toBe("60s · Medium targets");
    expect(formatGridShotTargetSizeLabel("legacy-local")).toBe("Unknown targets");
  });
});
