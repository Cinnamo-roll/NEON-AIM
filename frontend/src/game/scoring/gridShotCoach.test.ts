import { beforeEach, describe, expect, it } from "vitest";
import { setAppLanguage } from "../../i18n";
import type { TrainingSessionAnalysisSnapshot } from "../analysis/trainingAnalysis";
import { buildGridShotRuleAnalysis, GRID_SHOT_RULE_ENGINE_VERSION } from "./gridShotCoach";

function snapshot(overrides: Partial<TrainingSessionAnalysisSnapshot["summary"]> = {}): TrainingSessionAnalysisSnapshot {
  return {
    schemaVersion: 1,
    scope: "session",
    training: { id: "grid-shot", modeVersion: 1, scoringVersion: 1, configurationKey: "grid-shot:60s:medium" },
    source: { sessionId: "coach-test", completedAt: "2026-07-14T05:00:00Z" },
    summary: {
      score: 18_000,
      hits: 100,
      misses: 5,
      accuracy: 92,
      targetsPerMinute: 138,
      averageHitInterval: 360,
      consistencyScore: 82,
      maxCombo: 24,
      grade: "A",
      ...overrides,
    },
    windows: [],
    signals: [],
    integrity: { passed: true, errors: [] },
  };
}

describe("Grid Shot zero-token coach", () => {
  beforeEach(() => setAppLanguage("zh-CN"));

  it("turns a late accuracy drop into evidence and measurable next-run targets", () => {
    const input = snapshot();
    input.windows = [
      { label: "phase1", startMs: 0, endMs: 20_000, hits: 46, misses: 3, accuracy: 94, targetsPerMinute: 138, averageHitInterval: 360, consistencyScore: 85, score: 6_000 },
      { label: "phase2", startMs: 20_000, endMs: 40_000, hits: 45, misses: 4, accuracy: 91.8, targetsPerMinute: 135, averageHitInterval: 370, consistencyScore: 80, score: 5_900 },
      { label: "phase3", startMs: 40_000, endMs: 60_000, hits: 43, misses: 7, accuracy: 86, targetsPerMinute: 139, averageHitInterval: 350, consistencyScore: 72, score: 5_600 },
    ];

    const result = buildGridShotRuleAnalysis(input);

    expect(result.headline).toContain("最后阶段没有守住");
    expect(result.findings.map((finding) => finding.code)).toEqual(["CONTROL_FOUNDATION", "LATE_ACCURACY_DROP"]);
    expect(result.findings[0].severity).toBe("POSITIVE");
    expect(result.nextAction.targets.map((target) => target.metric)).toEqual(["lastPhaseAccuracy"]);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("prioritizes accuracy before rhythm when misses are the main limiter", () => {
    const result = buildGridShotRuleAnalysis(snapshot({ hits: 24, misses: 9, accuracy: 72.7, consistencyScore: 51 }));

    expect(result.headline).toContain("连击已经打出来");
    expect(result.findings.map((finding) => finding.code)).toEqual(["COMBO_STRENGTH", "ACCURACY_LIMITS_PACE", "RHYTHM_INSTABILITY"]);
    expect(result.findings[0].severity).toBe("POSITIVE");
    expect(result.nextAction.targets[0]).toMatchObject({ metric: "accuracy", operator: "AT_LEAST", value: 77.7 });
  });

  it("prioritizes rhythm when its relative gap is much larger than the accuracy gap", () => {
    const result = buildGridShotRuleAnalysis(snapshot({
      hits: 172,
      misses: 55,
      accuracy: 75.8,
      targetsPerMinute: 172,
      averageHitInterval: 321,
      consistencyScore: 20,
      maxCombo: 10,
    }));

    expect(result.headline).toContain("命中节奏稳定下来");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "COMBO_STRENGTH",
      "RHYTHM_INSTABILITY",
      "ACCURACY_LIMITS_PACE",
    ]);
    expect(result.findings[0].severity).toBe("POSITIVE");
    expect(result.nextAction.targets).toEqual([
      expect.objectContaining({ metric: "consistencyScore", value: 30 }),
    ]);
    expect(JSON.stringify(result)).not.toContain("75 分稳定基线");
    expect(JSON.stringify(result)).not.toContain("90% 目标");
  });

  it("only recommends pace after accuracy is already stable", () => {
    const result = buildGridShotRuleAnalysis(snapshot({ accuracy: 94, averageHitInterval: 450, consistencyScore: 84 }));

    expect(result.findings.map((finding) => finding.code)).toEqual(["CONTROL_FOUNDATION", "PACE_OPPORTUNITY"]);
    expect(result.summary).toContain("最值得保留");
    expect(result.nextAction.targets[0]).toMatchObject({ metric: "averageHitInterval", operator: "AT_MOST", value: 420 });
    expect(result.engineVersion).toBe(GRID_SHOT_RULE_ENGINE_VERSION);
  });

  it("distinguishes a late pace-for-control tradeoff from a generic accuracy problem", () => {
    const input = snapshot({ accuracy: 90, consistencyScore: 85, targetsPerMinute: 135 });
    input.windows = [
      { label: "phase1", startMs: 0, endMs: 20_000, hits: 38, misses: 2, accuracy: 95, targetsPerMinute: 120, averageHitInterval: 500, consistencyScore: 88, score: 5_000 },
      { label: "phase2", startMs: 20_000, endMs: 40_000, hits: 44, misses: 3, accuracy: 93.6, targetsPerMinute: 132, averageHitInterval: 455, consistencyScore: 84, score: 5_500 },
      { label: "phase3", startMs: 40_000, endMs: 60_000, hits: 50, misses: 9, accuracy: 85, targetsPerMinute: 150, averageHitInterval: 400, consistencyScore: 78, score: 5_900 },
    ];

    const result = buildGridShotRuleAnalysis(input);

    expect(result.headline).toContain("提速了");
    expect(result.findings.map((finding) => finding.code)).toContain("PACE_CONTROL_TRADEOFF");
    expect(result.nextAction.targets[0].metric).toBe("lastPhaseAccuracy");
  });

  it("detects late pace loss when slowing down did not buy more accuracy", () => {
    const input = snapshot({ accuracy: 92, consistencyScore: 84, targetsPerMinute: 140 });
    input.windows = [
      { label: "phase1", startMs: 0, endMs: 20_000, hits: 52, misses: 4, accuracy: 92.9, targetsPerMinute: 156, averageHitInterval: 385, consistencyScore: 86, score: 6_200 },
      { label: "phase2", startMs: 20_000, endMs: 40_000, hits: 48, misses: 4, accuracy: 92.3, targetsPerMinute: 144, averageHitInterval: 417, consistencyScore: 84, score: 5_900 },
      { label: "phase3", startMs: 40_000, endMs: 60_000, hits: 40, misses: 3, accuracy: 93, targetsPerMinute: 120, averageHitInterval: 500, consistencyScore: 80, score: 4_900 },
    ];

    const result = buildGridShotRuleAnalysis(input);

    expect(result.findings.map((finding) => finding.code)).toContain("LATE_PACE_DROP");
    expect(result.nextAction.targets[0]).toMatchObject({ metric: "targetsPerMinute", value: 145 });
  });

  it("keeps one evidence-backed phase strength even when the run has clear weaknesses", () => {
    const input = snapshot({ accuracy: 70, consistencyScore: 45, maxCombo: 4, hits: 42, misses: 18 });
    input.windows = [
      { label: "phase1", startMs: 0, endMs: 20_000, hits: 12, misses: 8, accuracy: 60, targetsPerMinute: 36, averageHitInterval: 1_500, consistencyScore: 40, score: 1_500 },
      { label: "phase2", startMs: 20_000, endMs: 40_000, hits: 18, misses: 4, accuracy: 81.8, targetsPerMinute: 54, averageHitInterval: 1_000, consistencyScore: 55, score: 2_400 },
      { label: "phase3", startMs: 40_000, endMs: 60_000, hits: 12, misses: 6, accuracy: 66.7, targetsPerMinute: 36, averageHitInterval: 1_400, consistencyScore: 42, score: 1_600 },
    ];

    const result = buildGridShotRuleAnalysis(input);

    expect(result.findings[0]).toMatchObject({ code: "BEST_PHASE_CONTROL", severity: "POSITIVE" });
    expect(result.findings[0].evidence).toContain("81.8%");
  });

  it("localizes deterministic coaching without changing the result structure", () => {
    setAppLanguage("en-US");
    const result = buildGridShotRuleAnalysis(snapshot({ accuracy: 94, averageHitInterval: 450 }));

    expect(result.headline).toContain("Control");
    expect(result.findings[0].evidence).toContain("94.0%");
    expect(result.source).toBe("RULES");
  });
});
