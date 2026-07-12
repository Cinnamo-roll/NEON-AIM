import { describe, expect, it } from "vitest";
import {
  analyzeGridShotEvents,
  calculateGridShotConsistency,
  type GridShotEvent,
  type GridShotEventType,
} from "./gridShotAnalytics";

type EventSeed = {
  elapsedMs: number;
  type: GridShotEventType;
  baseScore?: number;
  speedBonus?: number;
  comboBonus?: number;
  stabilityBonus?: number;
  targetLifetimeMs?: number;
};

function eventLog(seeds: readonly EventSeed[], sessionId = "session-a"): GridShotEvent[] {
  let combo = 0;
  let previousHitAt: number | undefined;
  return seeds.map((seed, index) => {
    const comboBefore = combo;
    combo = seed.type === "hit" ? combo + 1 : 0;
    const baseScore = seed.type === "hit" ? seed.baseScore ?? 100 : 0;
    const speedBonus = seed.type === "hit" ? seed.speedBonus ?? 0 : 0;
    const comboBonus = seed.type === "hit" ? seed.comboBonus ?? 0 : 0;
    const stabilityBonus = seed.type === "hit" ? seed.stabilityBonus ?? 0 : 0;
    const event: GridShotEvent = {
      id: `${sessionId}:${index}`,
      sessionId,
      timestamp: 1_000_000 + seed.elapsedMs,
      elapsedMs: seed.elapsedMs,
      type: seed.type,
      targetId: seed.type === "hit" ? index % 10 : undefined,
      targetActivatedAt: seed.type === "hit" ? Math.max(0, seed.elapsedMs - (seed.targetLifetimeMs ?? 250)) : undefined,
      targetLifetimeMs: seed.type === "hit" ? seed.targetLifetimeMs ?? 250 : undefined,
      previousHitAt: seed.type === "hit" ? previousHitAt : undefined,
      hitIntervalMs: seed.type === "hit" && previousHitAt !== undefined ? seed.elapsedMs - previousHitAt : undefined,
      comboBefore,
      comboAfter: combo,
      baseScore,
      speedBonus,
      comboBonus,
      stabilityBonus,
      totalScore: baseScore + speedBonus + comboBonus + stabilityBonus,
    };
    if (seed.type === "hit") previousHitAt = seed.elapsedMs;
    return event;
  });
}

describe("Grid Shot event-sourced analytics", () => {
  it("assigns exact 20-second boundaries once and preserves zero-error invariants", () => {
    const events = eventLog([
      { elapsedMs: 0, type: "hit" },
      { elapsedMs: 19_999.999, type: "hit" },
      { elapsedMs: 20_000, type: "hit" },
      { elapsedMs: 39_999.999, type: "miss" },
      { elapsedMs: 40_000, type: "hit" },
      { elapsedMs: 60_000, type: "hit" },
    ]);
    const analytics = analyzeGridShotEvents(events, { sessionDurationMs: 60_000 });

    expect(analytics.phases.map((phase) => ({ hits: phase.hits, misses: phase.misses, score: phase.score }))).toEqual([
      { hits: 2, misses: 0, score: 200 },
      { hits: 1, misses: 1, score: 100 },
      { hits: 2, misses: 0, score: 200 },
    ]);
    expect(analytics.phases.reduce((sum, phase) => sum + phase.score, 0)).toBe(analytics.score);
    expect(analytics.phases.reduce((sum, phase) => sum + phase.hits, 0)).toBe(analytics.hits);
    expect(analytics.phases.reduce((sum, phase) => sum + phase.misses, 0)).toBe(analytics.misses);
    expect(analytics.integrity.passed).toBe(true);
  });

  it("derives every score total from event score components", () => {
    const analytics = analyzeGridShotEvents(eventLog([
      { elapsedMs: 1_000, type: "hit", speedBonus: 30, comboBonus: 5, stabilityBonus: 5 },
      { elapsedMs: 1_250, type: "miss" },
      { elapsedMs: 1_500, type: "hit", speedBonus: 40, comboBonus: 10 },
    ]), { sessionDurationMs: 60_000 });

    expect(analytics).toMatchObject({
      eventCount: 3,
      shots: 3,
      hits: 2,
      misses: 1,
      baseScoreTotal: 200,
      speedBonusTotal: 70,
      comboBonusTotal: 15,
      stabilityBonusTotal: 5,
      score: 290,
    });
    expect(analytics.score).toBe(
      analytics.baseScoreTotal + analytics.speedBonusTotal + analytics.comboBonusTotal + analytics.stabilityBonusTotal,
    );
  });

  it("computes accuracy from hits plus misses", () => {
    const analytics = analyzeGridShotEvents(eventLog([
      { elapsedMs: 100, type: "hit" },
      { elapsedMs: 200, type: "hit" },
      { elapsedMs: 300, type: "miss" },
      { elapsedMs: 400, type: "miss" },
    ]), { sessionDurationMs: 60_000 });
    expect(analytics.shots).toBe(analytics.hits + analytics.misses);
    expect(analytics.accuracy).toBe(50);
  });

  it("computes TPM from active duration rather than assuming a 60-second run", () => {
    const fullMinute = eventLog(Array.from({ length: 138 }, (_, index) => ({
      elapsedMs: (index + 1) / 138 * 60_000,
      type: "hit" as const,
    })));
    const halfMinute = eventLog(Array.from({ length: 69 }, (_, index) => ({
      elapsedMs: (index + 1) / 69 * 30_000,
      type: "hit" as const,
    })));
    expect(analyzeGridShotEvents(fullMinute, { sessionDurationMs: 60_000 }).targetsPerMinute).toBe(138);
    expect(analyzeGridShotEvents(halfMinute, { sessionDurationMs: 30_000 }).targetsPerMinute).toBe(138);
  });

  it("measures intervals only between successful hits and does not turn a miss into a long interval", () => {
    const analytics = analyzeGridShotEvents(eventLog([
      { elapsedMs: 1_000, type: "hit" },
      { elapsedMs: 1_200, type: "miss" },
      { elapsedMs: 1_500, type: "hit" },
    ]), { sessionDurationMs: 60_000 });
    expect(analytics.hitIntervals).toEqual([500]);
    expect(analytics.averageHitInterval).toBe(500);
    expect(analytics.medianHitInterval).toBe(500);
    expect(analytics.fastestHitInterval).toBe(500);
    expect(analytics.slowestHitInterval).toBe(500);
  });

  it("averages target lifetime from hit events only", () => {
    const analytics = analyzeGridShotEvents(eventLog([
      { elapsedMs: 500, type: "hit", targetLifetimeMs: 200 },
      { elapsedMs: 700, type: "miss" },
      { elapsedMs: 1_000, type: "hit", targetLifetimeMs: 400 },
    ]), { sessionDurationMs: 60_000 });
    expect(analytics.averageTargetLifetime).toBe(300);
  });

  it("uses robust bounded consistency and applies a miss penalty without fake intervals", () => {
    const intervals = [200, 201, 199, 202, 5_000];
    const withoutMisses = calculateGridShotConsistency(intervals, 6, 0);
    const withMisses = calculateGridShotConsistency(intervals, 6, 6);
    expect(withoutMisses).toBeGreaterThan(90);
    expect(withMisses).toBeLessThan(withoutMisses);
    expect(withMisses).toBeGreaterThanOrEqual(0);
    expect(withoutMisses).toBeLessThanOrEqual(100);
    expect(calculateGridShotConsistency([], 0, 0)).toBe(0);
    expect(calculateGridShotConsistency([200, 201], 3, 0)).toBe(0);
  });

  it("flags non-zero miss scoring and component divergence", () => {
    const events = eventLog([{ elapsedMs: 1_000, type: "miss" }]);
    events[0].baseScore = 100;
    events[0].totalScore = 100;
    const analytics = analyzeGridShotEvents(events, { sessionDurationMs: 60_000 });
    expect(analytics.integrity.passed).toBe(false);
    expect(analytics.integrity.checks.missScoresZero).toBe(false);
    expect(analytics.integrity.errors).toContain("a miss event contains non-zero score");
  });

  it("never emits NaN and reports invalid source data", () => {
    const events = eventLog([{ elapsedMs: 1_000, type: "hit" }]);
    events[0].elapsedMs = Number.NaN;
    events[0].totalScore = Number.POSITIVE_INFINITY;
    const analytics = analyzeGridShotEvents(events, { sessionDurationMs: 60_000 });
    expect(analytics.integrity.passed).toBe(false);
    expect(analytics.integrity.checks.finiteValues).toBe(false);
    expect(Number.isFinite(analytics.score)).toBe(true);
    expect(Number.isFinite(analytics.accuracy)).toBe(true);
    expect(Number.isFinite(analytics.consistencyScore)).toBe(true);
    expect(Number.isFinite(analytics.grade.compositeScore)).toBe(true);
  });

  it("detects duplicated IDs, mixed sessions and broken combo chains", () => {
    const events = eventLog([
      { elapsedMs: 100, type: "hit" },
      { elapsedMs: 200, type: "hit" },
    ]);
    events[1].id = events[0].id;
    events[1].sessionId = "session-b";
    events[1].comboBefore = 9;
    const analytics = analyzeGridShotEvents(events, { sessionDurationMs: 60_000 });
    expect(analytics.integrity.checks.uniqueEventIds).toBe(false);
    expect(analytics.integrity.checks.singleSession).toBe(false);
    expect(analytics.integrity.checks.combosValid).toBe(false);
  });
});
