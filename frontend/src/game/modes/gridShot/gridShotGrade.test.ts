import { describe, expect, it } from "vitest";
import { GRID_SHOT_GRADE_CONFIG } from "./gridShotGradeConfig";
import { evaluateGridShotGrade, type GridShotGradeInput } from "./gridShotGrade";

const evaluate = (input: GridShotGradeInput) => evaluateGridShotGrade(input);

describe("Grid Shot grade", () => {
  it("keeps weights, caps and elite gates in one configuration", () => {
    expect(Object.values(GRID_SHOT_GRADE_CONFIG.weights).reduce((sum, weight) => sum + weight, 0)).toBe(1);
    expect(GRID_SHOT_GRADE_CONFIG.hardGates.S).toEqual({ accuracy: 93, targetsPerMinute: 150, consistency: 75, maxCombo: 30 });
    expect(GRID_SHOT_GRADE_CONFIG.hardGates["S+"]).toEqual({ accuracy: 97, targetsPerMinute: 180, consistency: 85, maxCombo: 50 });
  });

  it("caps low-accuracy fast spam at D", () => {
    const result = evaluate({ accuracy: 65, targetsPerMinute: 190, consistency: 40, maxCombo: 8 });
    expect(result.compositeScore).toBe(61.4);
    expect(result.rawGrade).toBe("B");
    expect(result.accuracyCap).toBe("D");
    expect(result.grade).toBe("D");
  });

  it("grades the reported video-like result as C with truthful subgrades", () => {
    const result = evaluate({ accuracy: 72.3, targetsPerMinute: 138, consistency: 49, maxCombo: 9 });
    expect(result.compositeScore).toBe(60.59);
    expect(result.rawGrade).toBe("B");
    expect(result.accuracyCap).toBe("C");
    expect(result.subgrades).toEqual({ accuracy: "C", speed: "B", consistency: "D", control: "D" });
    expect(result.grade).toBe("C");
    expect(result.limitedBy).toContain("accuracy-cap:C");
    expect(result.explanation).toBe("你的点击速度尚可，但准确率、稳定性和连续命中不足，评级受到准确率上限限制。");
  });

  it("keeps a medium result at B or below", () => {
    const result = evaluate({ accuracy: 84, targetsPerMinute: 140, consistency: 65, maxCombo: 22 });
    expect(result.compositeScore).toBe(72.64);
    expect(result.grade).toBe("B");
  });

  it("does not grant S+ for accuracy alone when speed is low", () => {
    const result = evaluate({ accuracy: 95, targetsPerMinute: 90, consistency: 88, maxCombo: 40 });
    expect(result.compositeScore).toBe(80.1);
    expect(result.hardGates["S+"].passed).toBe(false);
    expect(result.hardGates["S+"].failed).toContain("targetsPerMinute");
    expect(result.grade).toBe("A");
  });

  it("awards S only when its composite score and every S gate pass", () => {
    const result = evaluate({ accuracy: 94, targetsPerMinute: 165, consistency: 80, maxCombo: 38 });
    expect(result.compositeScore).toBe(87.92);
    expect(result.hardGates.S.passed).toBe(true);
    expect(result.grade).toBe("S");
  });

  it("awards S+ only when its composite score and every S+ gate pass", () => {
    const result = evaluate({ accuracy: 98, targetsPerMinute: 190, consistency: 90, maxCombo: 60 });
    expect(result.compositeScore).toBe(97.2);
    expect(result.hardGates.S.passed).toBe(true);
    expect(result.hardGates["S+"].passed).toBe(true);
    expect(result.grade).toBe("S+");
  });

  it("downgrades an S candidate that misses any S hard gate", () => {
    const result = evaluate({ accuracy: 96, targetsPerMinute: 180, consistency: 90, maxCombo: 20 });
    expect(result.rawGrade).toBe("S");
    expect(result.hardGates.S.failed).toEqual(["maxCombo"]);
    expect(result.hardGateCap).toBe("A");
    expect(result.grade).toBe("A");
    expect(result.explanation).toContain("连续控制");
  });

  it("downgrades an S+ candidate to S when only the S+ gate fails", () => {
    const result = evaluate({ accuracy: 98, targetsPerMinute: 170, consistency: 90, maxCombo: 55 });
    expect(result.rawGrade).toBe("S+");
    expect(result.hardGates.S.passed).toBe(true);
    expect(result.hardGates["S+"].failed).toEqual(["targetsPerMinute"]);
    expect(result.grade).toBe("S");
  });

  it("sanitizes invalid values instead of producing NaN", () => {
    const result = evaluate({ accuracy: Number.NaN, targetsPerMinute: Number.POSITIVE_INFINITY, consistency: -5, maxCombo: Number.NaN });
    expect(Number.isFinite(result.compositeScore)).toBe(true);
    expect(Object.values(result.subscores).every(Number.isFinite)).toBe(true);
    expect(result.grade).toBe("D");
  });
});
