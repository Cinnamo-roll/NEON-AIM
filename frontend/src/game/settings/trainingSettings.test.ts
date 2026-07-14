import { describe, expect, it } from "vitest";
import {
  applyGraphicsPreset,
  CATEGORY_DEFAULTS,
  DEFAULT_TRAINING_SETTINGS,
  patchCustomGraphics,
  sanitizeTrainingSettings,
} from "./trainingSettings";

describe("training settings behavior", () => {
  it("maps every graphics preset to real render features", () => {
    const low = applyGraphicsPreset(DEFAULT_TRAINING_SETTINGS, "low");
    const ultra = applyGraphicsPreset(DEFAULT_TRAINING_SETTINGS, "ultra");
    expect(low).toMatchObject({ renderScale: 0.67, dprMode: 1, lowSpec: true, antialiasEnabled: false });
    expect(ultra).toMatchObject({ renderScale: 1.1, dprMode: 2, lowSpec: false, antialiasEnabled: true });
  });

  it("marks a manually changed graphics field as custom", () => {
    expect(patchCustomGraphics(DEFAULT_TRAINING_SETTINGS, "renderScale", 0.75)).toMatchObject({ renderScale: 0.75, graphicsPreset: "custom" });
  });

  it("keeps FPS independent from the graphics quality preset", () => {
    expect(patchCustomGraphics(DEFAULT_TRAINING_SETTINGS, "fpsLimit", 144)).toMatchObject({ fpsLimit: 144, graphicsPreset: "high" });
  });

  it("provides actual defaults for every implemented category", () => {
    expect(Object.keys(CATEGORY_DEFAULTS)).toEqual(["general", "input", "crosshair", "graphics", "hud", "audio"]);
    expect(CATEGORY_DEFAULTS.general).toEqual({ language: "zh-CN" });
    expect(CATEGORY_DEFAULTS.input).toMatchObject({ horizontalRatio: 1, verticalRatio: 1, invertX: false, invertY: false });
    expect(CATEGORY_DEFAULTS.graphics).not.toHaveProperty("fov");
    expect(CATEGORY_DEFAULTS.graphics).not.toHaveProperty("particleQuality");
    expect(CATEGORY_DEFAULTS.crosshair).toMatchObject({ crosshairCenterDot: true, crosshairRing: false, crosshairTop: true });
    expect(CATEGORY_DEFAULTS.audio).toEqual({ volume: 0.55, muted: false, interfaceVolume: 0.9, interfaceMuted: false });
  });

  it("sanitizes project language and interface sound preferences", () => {
    expect(sanitizeTrainingSettings({ language: "en-US", interfaceVolume: 2, interfaceMuted: 1 })).toMatchObject({
      language: "en-US",
      interfaceVolume: 1,
      interfaceMuted: true,
    });
    expect(sanitizeTrainingSettings({ language: "invalid", interfaceVolume: Number.NaN })).toMatchObject({
      language: "zh-CN",
      interfaceVolume: 0.9,
    });
  });

  it("migrates the retired crosshair type into universal parameters", () => {
    const migrated = sanitizeTrainingSettings({ crosshair: "circle", crosshairThickness: 3 });
    expect(migrated).toMatchObject({
      crosshairTop: false,
      crosshairBottom: false,
      crosshairLeft: false,
      crosshairRight: false,
      crosshairCenterDot: false,
      crosshairRing: true,
      crosshairThickness: 3,
    });
    expect(migrated).not.toHaveProperty("crosshair");
  });

  it("drops retired and unknown persisted settings", () => {
    const sanitized = sanitizeTrainingSettings({
      sensitivity: 0.8,
      targetColor: "#ff0000",
      targetSize: 1.4,
      fogEnabled: false,
      pollingRate: 500,
      fov: 110,
      particleQuality: "off",
      hitVolume: 0.2,
      missVolume: 0.3,
      comboVolume: 0.4,
    });
    expect(sanitized.sensitivity).toBe(0.8);
    expect(sanitized).not.toHaveProperty("targetColor");
    expect(sanitized).not.toHaveProperty("targetSize");
    expect(sanitized).not.toHaveProperty("fogEnabled");
    expect(sanitized).not.toHaveProperty("pollingRate");
    expect(sanitized).not.toHaveProperty("fov");
    expect(sanitized).not.toHaveProperty("particleQuality");
    expect(sanitized).not.toHaveProperty("hitVolume");
    expect(sanitized).not.toHaveProperty("missVolume");
    expect(sanitized).not.toHaveProperty("comboVolume");
  });
});
