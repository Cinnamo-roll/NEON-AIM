import { describe, expect, it } from "vitest";
import { DEFAULT_GRID_SHOT_SETTINGS, getGridShotScene, gridShotParticleCount, sanitizeGridShotModeSettings } from "./gridShotConfig";

describe("Grid Shot mode settings", () => {
  it("keeps supported duration and target size tier", () => {
    expect(sanitizeGridShotModeSettings({ duration: 90, targetSize: "large", hitVolume: 0.8 })).toEqual({
      ...DEFAULT_GRID_SHOT_SETTINGS,
      duration: 90,
      targetSize: "large",
      hitVolume: 0.8,
    });
  });

  it("migrates legacy target scales and rejects unsupported durations", () => {
    expect(sanitizeGridShotModeSettings({ duration: 45, targetSize: 2, missVolume: -1, comboVolume: 4, screenGlow: 3 })).toEqual({
      ...DEFAULT_GRID_SHOT_SETTINGS,
      targetSize: "large",
      missVolume: 0,
      comboVolume: 1,
      screenGlow: 1,
    });
    expect(sanitizeGridShotModeSettings({ targetSize: 0.8 }).targetSize).toBe("small");
    expect(sanitizeGridShotModeSettings({ targetSize: 1 }).targetSize).toBe("medium");
  });

  it("drops unrelated scene and color fields", () => {
    expect(sanitizeGridShotModeSettings({ targetColor: "#ff0000", fogEnabled: false })).toEqual(DEFAULT_GRID_SHOT_SETTINGS);
  });

  it("keeps scene presentation owned by the selected Grid Shot scene", () => {
    expect(getGridShotScene("training-cabin")).toMatchObject({ name: "训练舱", camera: { fov: 82 } });
    expect(sanitizeGridShotModeSettings({ hitEffectStyle: "off" }).hitEffectStyle).toBe("off");
    expect(gridShotParticleCount("off")).toBe(0);
    expect(gridShotParticleCount("radial")).toBe(8);
    expect(gridShotParticleCount("shards")).toBe(12);
    expect(gridShotParticleCount("spiral")).toBe(12);
  });

  it("migrates the former intensity levels to particle styles", () => {
    expect(sanitizeGridShotModeSettings({ hitEffectLevel: "clean" }).hitEffectStyle).toBe("radial");
    expect(sanitizeGridShotModeSettings({ hitEffectLevel: "standard" }).hitEffectStyle).toBe("shards");
    expect(sanitizeGridShotModeSettings({ hitEffectLevel: "enhanced" }).hitEffectStyle).toBe("spiral");
  });
});
