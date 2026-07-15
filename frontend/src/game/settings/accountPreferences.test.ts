import { describe, expect, it } from "vitest";
import { DEFAULT_GRID_SHOT_SETTINGS } from "../modes/gridShot/gridShotConfig";
import { DEFAULT_TRAINING_SETTINGS } from "./trainingSettings";
import {
  applyAccountPreferenceDocument,
  applyDeviceTrainingSettings,
  applyGridShotDeviceSettings,
  createAccountPreferenceDocument,
  deviceTrainingSettings,
  gridShotDeviceSettings,
} from "./accountPreferences";

describe("account preferences", () => {
  it("stores account and device settings in separate documents", () => {
    const account = createAccountPreferenceDocument(
      { ...DEFAULT_TRAINING_SETTINGS, sensitivity: 0.8, volume: 0.2, renderScale: 0.67 },
      { ...DEFAULT_GRID_SHOT_SETTINGS, targetSize: "small", hitVolume: 0.3, screenGlow: 0.1 },
      "benchmark",
    );

    expect(account.settings).toMatchObject({ sensitivity: 0.8, language: "zh-CN" });
    expect(account.settings).not.toHaveProperty("volume");
    expect(account.settings).not.toHaveProperty("renderScale");
    expect(account.projects["grid-shot"]).toEqual({
      sessionType: "benchmark",
      mode: { duration: 60, targetSize: "small", sceneId: "training-cabin" },
    });
    expect(account.projects["grid-shot"].mode).not.toHaveProperty("hitVolume");
    expect(deviceTrainingSettings(DEFAULT_TRAINING_SETTINGS)).toHaveProperty("volume");
    expect(gridShotDeviceSettings(DEFAULT_GRID_SHOT_SETTINGS)).toHaveProperty("hitVolume");
  });

  it("applies cloud account fields without overwriting this device", () => {
    const current = {
      settings: { ...DEFAULT_TRAINING_SETTINGS, volume: 0.17, renderScale: 0.67, hudScale: 1.3 },
      gridShotSettings: { ...DEFAULT_GRID_SHOT_SETTINGS, hitVolume: 0.25, screenGlow: 0.2 },
      gridShotSessionType: "practice" as const,
    };
    const remote = createAccountPreferenceDocument(
      { ...DEFAULT_TRAINING_SETTINGS, language: "en-US", sensitivity: 1.25, volume: 1, renderScale: 1.25 },
      { ...DEFAULT_GRID_SHOT_SETTINGS, targetSize: "large", hitVolume: 1, screenGlow: 1 },
      "practice",
    );

    const applied = applyAccountPreferenceDocument(current, remote);
    expect(applied.settings).toMatchObject({
      language: "en-US",
      sensitivity: 1.25,
      volume: 0.17,
      renderScale: 0.67,
      hudScale: 1.3,
    });
    expect(applied.gridShotSettings).toMatchObject({ targetSize: "large", hitVolume: 0.25, screenGlow: 0.2 });
    expect(applied.gridShotSessionType).toBe("practice");
  });

  it("ignores unknown fields and clamps malformed remote values", () => {
    const current = {
      settings: DEFAULT_TRAINING_SETTINGS,
      gridShotSettings: DEFAULT_GRID_SHOT_SETTINGS,
      gridShotSessionType: "practice" as const,
    };
    const applied = applyAccountPreferenceDocument(current, {
      schemaVersion: 1,
      settings: {
        sensitivity: 999,
        mouseDpi: -5,
        crosshairOpacity: -1,
        crosshairColor: "not-a-color",
        volume: 0,
      },
      projects: { "grid-shot": { sessionType: "unknown", mode: { duration: 999, hitVolume: 0 } } },
    });

    expect(applied.settings).toMatchObject({
      sensitivity: 10,
      mouseDpi: 50,
      crosshairOpacity: 0.2,
      crosshairColor: DEFAULT_TRAINING_SETTINGS.crosshairColor,
      volume: DEFAULT_TRAINING_SETTINGS.volume,
    });
    expect(applied.gridShotSettings).toEqual(DEFAULT_GRID_SHOT_SETTINGS);
    expect(applied.gridShotSessionType).toBe("practice");
  });

  it("loads only approved device fields from local storage", () => {
    const settings = applyDeviceTrainingSettings(DEFAULT_TRAINING_SETTINGS, {
      volume: 2,
      hudScale: 0,
      fpsLimit: 144,
      sensitivity: 9,
    });
    const grid = applyGridShotDeviceSettings(DEFAULT_GRID_SHOT_SETTINGS, {
      hitVolume: -1,
      screenGlow: 2,
      targetSize: "large",
    });

    expect(settings).toMatchObject({ volume: 1, hudScale: 0.7, fpsLimit: 144, sensitivity: 0.55 });
    expect(grid).toMatchObject({ hitVolume: 0, screenGlow: 1, targetSize: "medium" });
  });
});
