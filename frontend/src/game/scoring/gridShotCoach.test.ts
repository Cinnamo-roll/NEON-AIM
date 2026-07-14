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

    expect(result.headline).toContain("整体打得很稳");
    expect(result.findings.map((finding) => finding.code)).toEqual(["CONTROL_FOUNDATION", "LATE_ACCURACY_DROP"]);
    expect(result.findings[0].severity).toBe("POSITIVE");
    expect(result.nextAction.targets.map((target) => target.metric)).toEqual(["lastPhaseAccuracy", "consistencyScore"]);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("prioritizes accuracy before rhythm when misses are the main limiter", () => {
    const result = buildGridShotRuleAnalysis(snapshot({ hits: 24, misses: 9, accuracy: 72.7, consistencyScore: 51 }));

    expect(result.headline).toContain("连击已经打出来了");
    expect(result.findings.map((finding) => finding.code)).toEqual(["COMBO_STRENGTH", "ACCURACY_LIMITS_PACE", "RHYTHM_INSTABILITY"]);
    expect(result.findings[0].severity).toBe("POSITIVE");
    expect(result.nextAction.targets[0]).toMatchObject({ metric: "accuracy", operator: "AT_LEAST", value: 90 });
  });

  it("only recommends pace after accuracy is already stable", () => {
    const result = buildGridShotRuleAnalysis(snapshot({ accuracy: 94, averageHitInterval: 450, consistencyScore: 84 }));

    expect(result.findings.map((finding) => finding.code)).toEqual(["CONTROL_FOUNDATION", "PACE_OPPORTUNITY"]);
    expect(result.summary).toContain("最值得保留");
    expect(result.nextAction.targets[0]).toMatchObject({ metric: "averageHitInterval", operator: "AT_MOST", value: 420 });
    expect(result.engineVersion).toBe(GRID_SHOT_RULE_ENGINE_VERSION);
  });

  it("localizes deterministic coaching without changing the result structure", () => {
    setAppLanguage("en-US");
    const result = buildGridShotRuleAnalysis(snapshot({ accuracy: 94, averageHitInterval: 450 }));

    expect(result.headline).toContain("Accuracy");
    expect(result.findings[0].evidence).toContain("94.0%");
    expect(result.source).toBe("RULES");
  });
});
