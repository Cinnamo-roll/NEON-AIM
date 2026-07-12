import { describe, expect, it } from "vitest";
import { scoreGridShotHit } from "../scoring/gridShotScoring";
import { comboMilestone, createHitFeedback, shouldShowRecordPace } from "./gridShotFeedback";

describe("Grid Shot feedback", () => {
  it("creates layered score feedback and labels fast hits", () => { const feedback = createHitFeedback(scoreGridShotHit(180, 2, [180]), 2); expect(feedback.score).toBeGreaterThan(100); expect(feedback.label).toBe("FLOW"); expect(feedback.interval).toBe(180); });
  it("triggers Combo 10 and positive record pace notices", () => { expect(comboMilestone(10)).toEqual({ combo: 10, subtitle: "RHYTHM STABLE" }); expect(comboMilestone(9)).toBeNull(); expect(shouldShowRecordPace(6.4, false)).toBe(true); expect(shouldShowRecordPace(6.4, true)).toBe(false); });
  it("does not create a hit marker for a miss", () => { const feedback = null; expect(feedback).toBeNull(); });
});
