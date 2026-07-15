import { describe, expect, it } from "vitest";
import { TRAINING_ANALYSIS_LIMITS } from "../../analysis/trainingAnalysis";
import { createEmptyGridShotStats, createGridShotRecord } from "../../scoring/gridShotSession";
import type { GridShotEvent, GridShotEventType } from "./gridShotAnalytics";
import { buildGridShotAnalysisBundle } from "./gridShotAnalysisSnapshot";
import { comboBonus, isStable, speedBonus } from "../../scoring/gridShotScoreRules";

type EventSeed = {
  elapsedMs: number;
  type: GridShotEventType;
};

function eventLog(seeds: readonly EventSeed[], sessionId = "analysis-session"): GridShotEvent[] {
  let combo = 0;
  let previousHitAt: number | undefined;
  const intervals: number[] = [];
  return seeds.map((seed, index) => {
    const comboBefore = combo;
    combo = seed.type === "hit" ? combo + 1 : 0;
    const previous = previousHitAt;
    const interval = seed.type === "hit" && previous !== undefined ? seed.elapsedMs - previous : undefined;
    if (interval !== undefined) intervals.push(interval);
    const baseScore = seed.type === "hit" ? 100 : 0;
    const speed = seed.type === "hit" ? speedBonus(interval ?? null).bonus : 0;
    const comboPoints = seed.type === "hit" ? comboBonus(combo) : 0;
    const stability = seed.type === "hit" && isStable(intervals) ? 5 : 0;
    const event: GridShotEvent = {
      id: `${sessionId}:${index}`,
      sessionId,
      timestamp: 1_000_000 + seed.elapsedMs,
      elapsedMs: seed.elapsedMs,
      type: seed.type,
      targetId: seed.type === "hit" ? index : undefined,
      targetActivatedAt: seed.type === "hit" ? 1_000_000 + seed.elapsedMs - 250 : undefined,
      targetLifetimeMs: seed.type === "hit" ? 250 : undefined,
      previousHitAt: seed.type === "hit" ? previous : undefined,
      hitIntervalMs: interval,
      comboBefore,
      comboAfter: combo,
      baseScore,
      speedBonus: speed,
      comboBonus: comboPoints,
      stabilityBonus: stability,
      totalScore: baseScore + speed + comboPoints + stability,
    };
    if (seed.type === "hit") previousHitAt = seed.elapsedMs;
    return event;
  });
}

function recordFor(seeds: readonly EventSeed[], duration = 60) {
  const stats = createEmptyGridShotStats("analysis-session", duration);
  stats.events = eventLog(seeds);
  return createGridShotRecord(stats, duration);
}

describe("Grid Shot bounded analysis snapshot", () => {
  it("keeps five-second detail while sending only three compact windows to AI", () => {
    const record = recordFor([
      { elapsedMs: 1_000, type: "hit" },
      { elapsedMs: 4_000, type: "hit" },
      { elapsedMs: 20_000, type: "hit" },
      { elapsedMs: 25_000, type: "miss" },
      { elapsedMs: 40_000, type: "hit" },
      { elapsedMs: 45_000, type: "miss" },
      { elapsedMs: 50_000, type: "miss" },
    ]);
    const bundle = buildGridShotAnalysisBundle(record, { targetSize: "medium" });

    expect(bundle.detailSegments).toHaveLength(12);
    expect(bundle.aiSnapshot.windows).toHaveLength(3);
    expect(bundle.aiSnapshot.windows.map((window) => ({ hits: window.hits, misses: window.misses }))).toEqual([
      { hits: 2, misses: 0 },
      { hits: 1, misses: 1 },
      { hits: 1, misses: 2 },
    ]);
    expect(bundle.aiSnapshot.training.configurationKey).toBe("grid-shot:60s:medium");
    expect(JSON.stringify(bundle.aiSnapshot).length).toBeLessThan(3_500);
  });

  it("computes phase rhythm from hits inside that phase instead of importing a cross-boundary interval", () => {
    const bundle = buildGridShotAnalysisBundle(recordFor([
      { elapsedMs: 10_000, type: "hit" },
      { elapsedMs: 20_000, type: "hit" },
      { elapsedMs: 21_000, type: "hit" },
      { elapsedMs: 22_000, type: "hit" },
      { elapsedMs: 23_000, type: "hit" },
    ]), { targetSize: "medium" });

    expect(bundle.aiSnapshot.summary.averageHitInterval).toBe(3_250);
    expect(bundle.aiSnapshot.windows[1].averageHitInterval).toBe(1_000);
    expect(bundle.aiSnapshot.windows[1].medianHitInterval).toBe(1_000);
    expect(bundle.aiSnapshot.windows[1].consistencyScore).toBe(100);
  });

  it("uses the target size captured by the session instead of reinterpreting history with current settings", () => {
    const record = recordFor([{ elapsedMs: 1_000, type: "hit" }]);
    record.configuration = { targetSize: "small", activeTargetCount: 3 };

    const bundle = buildGridShotAnalysisBundle(record, { targetSize: "large" });

    expect(bundle.targetSize).toBe("small");
    expect(bundle.aiSnapshot.training.configurationKey).toBe("grid-shot:60s:small");
  });

  it("does not hide a non-chronological source log while sorting events for charts", () => {
    const record = recordFor([
      { elapsedMs: 1_000, type: "hit" },
      { elapsedMs: 2_000, type: "hit" },
    ]);
    record.events = [...(record.events ?? [])].reverse();

    const bundle = buildGridShotAnalysisBundle(record, { targetSize: "medium" });

    expect(bundle.aiSnapshot.integrity.passed).toBe(false);
    expect(bundle.aiSnapshot.integrity.errors).toContain("event log is not chronological");
    expect(bundle.aiSnapshot.signals.map((signal) => signal.code)).toEqual(["INTEGRITY_REVIEW_REQUIRED"]);
  });

  it("detects a meaningful late-session accuracy drop with numeric evidence", () => {
    const first = Array.from({ length: 10 }, (_, index) => ({ elapsedMs: 1_000 + index * 1_500, type: "hit" as const }));
    const middle = Array.from({ length: 10 }, (_, index) => ({
      elapsedMs: 21_000 + index * 1_500,
      type: index < 8 ? "hit" as const : "miss" as const,
    }));
    const last = Array.from({ length: 10 }, (_, index) => ({
      elapsedMs: 41_000 + index * 1_500,
      type: index < 6 ? "hit" as const : "miss" as const,
    }));
    const bundle = buildGridShotAnalysisBundle(recordFor([...first, ...middle, ...last]), { targetSize: "small" });
    const signal = bundle.aiSnapshot.signals.find((candidate) => candidate.code === "LATE_ACCURACY_DROP");

    expect(signal).toBeDefined();
    expect(signal?.evidence).toMatchObject({ firstAccuracy: 100, lastAccuracy: 60, accuracyDelta: -40 });
    expect(bundle.aiSnapshot.signals.length).toBeLessThanOrEqual(TRAINING_ANALYSIS_LIMITS.maxSignals);
  });

  it("sends strengths and actual evidence without presenting rule references as player goals", () => {
    const hits = Array.from({ length: 10 }, (_, index) => ({ elapsedMs: 1_000 + index * 500, type: "hit" as const }));
    const misses = Array.from({ length: 5 }, (_, index) => ({ elapsedMs: 8_000 + index * 500, type: "miss" as const }));
    const bundle = buildGridShotAnalysisBundle(recordFor([...hits, ...misses]), { targetSize: "medium" });

    expect(bundle.aiSnapshot.signals[0]).toMatchObject({ code: "COMBO_STRENGTH", severity: "positive" });
    expect(JSON.stringify(bundle.aiSnapshot.signals)).not.toContain("targetAccuracy");
    expect(JSON.stringify(bundle.aiSnapshot.signals)).not.toContain("targetConsistency");
  });

  it("bounds a ninety-second session to eighteen detail segments and three AI windows", () => {
    const record = recordFor([
      { elapsedMs: 1_000, type: "hit" },
      { elapsedMs: 89_000, type: "hit" },
    ], 90);
    const bundle = buildGridShotAnalysisBundle(record, { targetSize: "large" });

    expect(bundle.detailSegments).toHaveLength(18);
    expect(bundle.aiSnapshot.windows).toHaveLength(3);
    expect(bundle.aiSnapshot.windows.at(-1)).toMatchObject({ startMs: 60_000, endMs: 90_000 });
  });

  it("adds only aggregated baseline deltas instead of historical session payloads", () => {
    const record = recordFor([
      { elapsedMs: 1_000, type: "hit" },
      { elapsedMs: 2_000, type: "hit" },
    ]);
    const bundle = buildGridShotAnalysisBundle(record, {
      targetSize: "medium",
      baseline: {
        sampleSize: 5,
        averageScore: 200,
        averageAccuracy: 90,
        averageTargetsPerMinute: 1,
        averageConsistencyScore: 60,
      },
    });

    expect(bundle.aiSnapshot.comparison).toMatchObject({
      sampleSize: 5,
      scoreDeltaPercent: 0,
      accuracyDelta: 10,
      targetsPerMinuteDelta: 1,
      consistencyDelta: -60,
    });
  });
});
