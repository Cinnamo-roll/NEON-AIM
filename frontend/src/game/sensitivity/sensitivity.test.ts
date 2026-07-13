import { describe, expect, it } from "vitest";
import {
  canonicalFromGame,
  canonicalFromProfile,
  createNeonInputSensitivity,
  gameProfilesForDisplay,
  horizontalToVerticalFov,
  NEON_YAW_DEGREES_PER_COUNT,
  normalizeNeonInputSettings,
  profiles,
  roundSensitivity,
  sensitivityFromCanonical,
  sensitivityFromProfile,
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
      const sensitivity = profile.id === "pubg" ? 43.7 : 1.25;
      const canonical = canonicalFromProfile(sensitivity, 800, profile);
      expect(sensitivityFromProfile(canonical, profile)).toBeCloseTo(sensitivity, 10);
    });
  });

  it("uses PUBG's exponential general-sensitivity curve in both directions", () => {
    const pubg = profiles.find((profile) => profile.id === "pubg")!;
    const atFifty = canonicalFromProfile(50, 800, pubg);
    const expected = canonicalFromGame(1, 800, 0.02);
    expect(atFifty.radiansPerMouseCount).toBeCloseTo(expected.radiansPerMouseCount, 12);
    expect(atFifty.cmPer360).toBeCloseTo(expected.cmPer360, 10);
    expect(sensitivityFromProfile(expected, pubg)).toBeCloseTo(50, 10);
  });

  it("converts CS2 hipfire to PUBG and back without treating PUBG as linear", () => {
    const cs2 = profiles.find((profile) => profile.id === "cs2")!;
    const pubg = profiles.find((profile) => profile.id === "pubg")!;
    const cs2Canonical = canonicalFromProfile(1, 800, cs2);
    const pubgSensitivity = sensitivityFromProfile(cs2Canonical, pubg);
    expect(pubgSensitivity).toBeCloseTo(52.069634, 6);
    expect(sensitivityFromProfile(canonicalFromProfile(pubgSensitivity, 800, pubg), cs2)).toBeCloseTo(1, 10);
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

  it("keeps Delta Force and CrossFire raw hipfire aligned with the Source baseline", () => {
    const cs2 = profiles.find((profile) => profile.id === "cs2")!;
    const deltaForce = profiles.find((profile) => profile.id === "delta-force")!;
    const crossFire = profiles.find((profile) => profile.id === "crossfire")!;
    const canonical = canonicalFromGame(1.37, 800, cs2.yawCoefficient!);
    expect(sensitivityFromCanonical(canonical, deltaForce.yawCoefficient!)).toBeCloseTo(1.37, 10);
    expect(sensitivityFromCanonical(canonical, crossFire.yawCoefficient!)).toBeCloseTo(1.37, 10);
  });

  it("keeps profile ids unique and user-facing names concise", () => {
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(profiles.length);
    expect(profiles.find((profile) => profile.id === "fortnite")?.name).toBe("Fortnite");
    expect(profiles.find((profile) => profile.id === "pubg")?.sensitivityStep).toBe(0.1);
  });

  it("keeps NEON first and sorts external games alphabetically for selectors", () => {
    expect(gameProfilesForDisplay[0].id).toBe("neon");
    const externalNames = gameProfilesForDisplay.slice(1).map((profile) => profile.name);
    expect(externalNames).toEqual([...externalNames].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" })));
  });
});
