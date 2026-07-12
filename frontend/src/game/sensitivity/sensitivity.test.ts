import { describe, expect, it } from "vitest";
import {
  canonicalFromGame,
  createNeonInputSensitivity,
  horizontalToVerticalFov,
  NEON_YAW_DEGREES_PER_COUNT,
  normalizeNeonInputSettings,
  profiles,
  roundSensitivity,
  sensitivityFromCanonical,
  verticalToHorizontalFov,
} from "./sensitivity";

describe("canonical sensitivity", () => {
  it("round trips game sensitivity", () => {
    const canonical = canonicalFromGame(1.5, 800, NEON_YAW_DEGREES_PER_COUNT);
    expect(sensitivityFromCanonical(canonical, NEON_YAW_DEGREES_PER_COUNT)).toBeCloseTo(1.5, 8);
  });

  it("uses one NEON pipeline for settings and gameplay", () => {
    const settings = { sensitivity: 0.55, mouseDpi: 800, horizontalRatio: 1, verticalRatio: 1.15 };
    const input = createNeonInputSensitivity(settings);
    const direct = canonicalFromGame(settings.sensitivity, settings.mouseDpi, NEON_YAW_DEGREES_PER_COUNT);
    expect(input.radiansPerMouseCount).toBe(direct.radiansPerMouseCount);
    expect(input.cmPer360).toBe(direct.cmPer360);
    expect(input.verticalRatio).toBe(1.15);
  });

  it("keeps radians per count independent from DPI while cm/360 tracks DPI", () => {
    const lowDpi = createNeonInputSensitivity({ sensitivity: 0.55, mouseDpi: 400, horizontalRatio: 1, verticalRatio: 1 });
    const highDpi = createNeonInputSensitivity({ sensitivity: 0.55, mouseDpi: 1600, horizontalRatio: 1, verticalRatio: 1 });
    expect(lowDpi.radiansPerMouseCount).toBe(highDpi.radiansPerMouseCount);
    expect(lowDpi.cmPer360).toBeCloseTo(highDpi.cmPer360 * 4, 10);
  });

  it("scales rotation linearly with the saved sensitivity", () => {
    const low = createNeonInputSensitivity({ sensitivity: 0.5, mouseDpi: 800, horizontalRatio: 1, verticalRatio: 1 });
    const high = createNeonInputSensitivity({ sensitivity: 1, mouseDpi: 800, horizontalRatio: 1, verticalRatio: 1 });
    expect(high.radiansPerMouseCount).toBeCloseTo(low.radiansPerMouseCount * 2, 12);
  });

  it("normalizes invalid persisted input settings", () => {
    expect(normalizeNeonInputSettings({
      sensitivity: Number.NaN,
      mouseDpi: Number.POSITIVE_INFINITY,
      horizontalRatio: 4,
      verticalRatio: -4,
    })).toEqual({ sensitivity: 0.55, mouseDpi: 800, horizontalRatio: 2, verticalRatio: 0.1 });
  });

  it("stores NEON sensitivity with at most three decimal places", () => {
    expect(roundSensitivity(0.777_89)).toBe(0.778);
    expect(normalizeNeonInputSettings({ sensitivity: 1.234_56, mouseDpi: 800, horizontalRatio: 1, verticalRatio: 1 }).sensitivity).toBe(1.235);
  });

  it("keeps base radians stable while X multiplier changes horizontal cm/360", () => {
    const normal = createNeonInputSensitivity({ sensitivity: 0.5, mouseDpi: 800, horizontalRatio: 1, verticalRatio: 1 });
    const fasterX = createNeonInputSensitivity({ sensitivity: 0.5, mouseDpi: 800, horizontalRatio: 1.5, verticalRatio: 1 });
    expect(fasterX.radiansPerMouseCount).toBe(normal.radiansPerMouseCount);
    expect(fasterX.cmPer360).toBeCloseTo(normal.cmPer360 / 1.5, 10);
  });

  it("round trips FOV", () => {
    const vertical = horizontalToVerticalFov(103, 16 / 9);
    expect(verticalToHorizontalFov(vertical, 16 / 9)).toBeCloseTo(103, 8);
  });

  it("round trips every supported FPS hipfire profile", () => {
    profiles.forEach((profile) => {
      expect(profile.yawCoefficient).toBeTypeOf("number");
      const canonical = canonicalFromGame(1.25, 800, profile.yawCoefficient!);
      expect(sensitivityFromCanonical(canonical, profile.yawCoefficient!)).toBeCloseTo(1.25, 10);
    });
  });

  it("matches known cross-game hipfire ratios", () => {
    const cs2 = profiles.find((profile) => profile.id === "cs2")!;
    const valorant = profiles.find((profile) => profile.id === "valorant")!;
    const apex = profiles.find((profile) => profile.id === "apex")!;
    const overwatch = profiles.find((profile) => profile.id === "overwatch-2")!;
    const canonical = canonicalFromGame(1, 800, cs2.yawCoefficient!);
    expect(sensitivityFromCanonical(canonical, valorant.yawCoefficient!)).toBeCloseTo(0.314285714, 8);
    expect(sensitivityFromCanonical(canonical, apex.yawCoefficient!)).toBeCloseTo(1, 10);
    expect(sensitivityFromCanonical(canonical, overwatch.yawCoefficient!)).toBeCloseTo(3.333333333, 8);
  });
});
