import { describe, expect, it } from "vitest";
import {
  applyGraphicsPreset,
  CATEGORY_DEFAULTS,
  DEFAULT_TRAINING_SETTINGS,
  patchCustomGraphics,
} from "./trainingSettings";

describe("training settings behavior", () => {
  it("maps every graphics preset to real render features", () => {
    const low = applyGraphicsPreset(DEFAULT_TRAINING_SETTINGS, "low");
    const ultra = applyGraphicsPreset(DEFAULT_TRAINING_SETTINGS, "ultra");
    expect(low).toMatchObject({ renderScale: 0.67, dprMode: 1, particleQuality: "off", fogEnabled: false, dynamicGridEnabled: false, lowSpec: true, antialiasEnabled: false });
    expect(ultra).toMatchObject({ renderScale: 1.1, dprMode: 2, particleQuality: "high", fogEnabled: true, dynamicGridEnabled: true, lowSpec: false, antialiasEnabled: true });
  });

  it("marks a manually changed graphics field as custom", () => {
    expect(patchCustomGraphics(DEFAULT_TRAINING_SETTINGS, "renderScale", 0.75)).toMatchObject({ renderScale: 0.75, graphicsPreset: "custom" });
  });

  it("provides actual defaults for every implemented category", () => {
    expect(Object.keys(CATEGORY_DEFAULTS)).toEqual(["input", "crosshair", "graphics", "hud", "audio"]);
    expect(CATEGORY_DEFAULTS.input).toMatchObject({ horizontalRatio: 1, verticalRatio: 1, invertX: false, invertY: false });
    expect(CATEGORY_DEFAULTS.input).not.toHaveProperty("fov");
    expect(CATEGORY_DEFAULTS.graphics).toMatchObject({ fov: 82 });
    expect(CATEGORY_DEFAULTS.crosshair.showHitMarker).toBe(true);
    expect(CATEGORY_DEFAULTS.audio.hitVolume).toBe(1);
  });
});
