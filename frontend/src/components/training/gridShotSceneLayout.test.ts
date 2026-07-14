import { describe, expect, it } from "vitest";
import { getGridShotScene } from "../../game/modes/gridShot/gridShotConfig";
import {
  getGridShotImpactVisual,
  getGridShotParticleTransform,
  GRID_SHOT_SAFE_POSITIONS,
  GRID_SHOT_TARGET_DEPTH,
} from "./gridShotSceneLayout";

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

  it("keeps the target plane at a deliberate mid-range training distance", () => {
    const cameraZ = getGridShotScene("training-cabin").camera.position[2];
    const depthDistances = GRID_SHOT_SAFE_POSITIONS.map((position) => cameraZ - position[2]);

    expect(cameraZ - GRID_SHOT_TARGET_DEPTH.center).toBeGreaterThanOrEqual(8.4);
    expect(Math.min(...depthDistances)).toBeGreaterThan(8.2);
    expect(GRID_SHOT_TARGET_DEPTH.min).toBeLessThan(GRID_SHOT_TARGET_DEPTH.max);
  });
});
