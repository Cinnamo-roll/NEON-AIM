import { describe, expect, it } from "vitest";
import { GRID_SHOT_QA_DURATION, gridShotQaCapabilities, qaJump } from "./gridShotQa";
import { applyGridShotHit, applyGridShotMiss, createEmptyGridShotStats, createGridShotRecord } from "../scoring/gridShotSession";

describe("Grid Shot QA state", () => {
  it("skips fullscreen and pointer lock and enters playing", () => { expect(gridShotQaCapabilities).toEqual({ requiresFullscreen: false, requiresPointerLock: false }); expect(qaJump("playing")).toEqual({ trainingState: "playing", remaining: GRID_SHOT_QA_DURATION }); });
  it("jumps to final ten and finishes with a real result", () => { expect(qaJump("final-ten")).toEqual({ trainingState: "playing", remaining: 9.8 }); const stats = createEmptyGridShotStats(); stats.elapsedTime = 5; applyGridShotHit(stats, 180, 180, GRID_SHOT_QA_DURATION, 500); applyGridShotMiss(stats); const record = createGridShotRecord(stats, GRID_SHOT_QA_DURATION); expect(qaJump("finished")).toEqual({ trainingState: "finished", remaining: 0 }); expect(record.score).toBe(stats.score); expect(record.hits).toBe(1); expect(record.misses).toBe(1); expect(record.accuracy).toBe(50); });
});
