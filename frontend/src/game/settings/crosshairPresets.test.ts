import { describe, expect, it } from "vitest";
import { DEFAULT_TRAINING_SETTINGS } from "./trainingSettings";
import { applyCrosshairPreset, matchCrosshairPreset } from "./crosshairPresets";

describe("crosshair presets", () => {
  it("writes universal structure parameters instead of a rendering type", () => {
    const dot = applyCrosshairPreset(DEFAULT_TRAINING_SETTINGS, "dot");
    expect(dot).toMatchObject({
      crosshairTop: false,
      crosshairBottom: false,
      crosshairLeft: false,
      crosshairRight: false,
      crosshairCenterDot: true,
      crosshairRing: false,
      crosshairDotSize: 4,
    });
    expect(matchCrosshairPreset(dot)).toBe("dot");
  });

  it("becomes custom when any structural parameter changes", () => {
    const cross = applyCrosshairPreset(DEFAULT_TRAINING_SETTINGS, "cross");
    expect(matchCrosshairPreset({ ...cross, crosshairGap: cross.crosshairGap + 1 })).toBeNull();
  });

  it("builds a T shape by disabling only the top arm", () => {
    const tShape = applyCrosshairPreset(DEFAULT_TRAINING_SETTINGS, "t-shape");
    expect(tShape).toMatchObject({ crosshairTop: false, crosshairBottom: true, crosshairLeft: true, crosshairRight: true });
  });
});
