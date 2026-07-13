import { describe, expect, it } from "vitest";
import { getGridShotImpactVisual, getGridShotParticleTransform } from "./gridShotSceneLayout";

describe("Grid Shot particle styles", () => {
  it("uses distinct trajectories for each visible effect style", () => {
    const radial = getGridShotParticleTransform("radial", 3, 0.45);
    const shards = getGridShotParticleTransform("shards", 3, 0.45);
    const spiral = getGridShotParticleTransform("spiral", 3, 0.45);

    expect(radial).not.toEqual(shards);
    expect(shards).not.toEqual(spiral);
    expect(spiral).not.toEqual(radial);
  });

  it("does not produce particles when effects are disabled", () => {
    expect(getGridShotParticleTransform("off", 0, 0.2)).toBeNull();
  });

  it("provides one shared impact frame for the arena and settings preview", () => {
    expect(getGridShotImpactVisual("radial", 0.35)).toMatchObject({
      ringVisible: false,
      particlesVisible: true,
    });
    expect(getGridShotImpactVisual("spiral", 0.35)).toMatchObject({
      ringVisible: true,
      particlesVisible: true,
    });
    expect(getGridShotImpactVisual("off", 0.1)).toMatchObject({
      flashVisible: false,
      ringVisible: false,
      particlesVisible: false,
    });
  });
});
