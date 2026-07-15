import { describe, expect, it } from "vitest";
import type { TrainingSessionSummaryResponse } from "../storage/trainingSessionService";
import type { GridShotHistoryRecord } from "../types/training";
import {
  cloudGridShotCareerSession,
  localGridShotCareerDetail,
  localGridShotCareerSession,
  isGridShotBenchmarkSession,
  mergeGridShotCareerSessions,
  summarizeGridShotCareer,
} from "./gridShotCareer";

function localRecord(overrides: Partial<GridShotHistoryRecord> = {}): GridShotHistoryRecord {
  return {
    id: "local-record",
    sessionId: "session-1",
    createdAt: "2026-07-14T10:00:00.000Z",
    duration: 60,
    grade: "A",
    sessionDurationMs: 60_000,
    score: 12_000,
    shots: 100,
    hits: 90,
    misses: 10,
    accuracy: 90,
    maxCombo: 20,
    targetsPerMinute: 90,
    scoreTimeline: [],
    averageHitInterval: 300,
    medianHitInterval: 290,
    fastestHitInterval: 180,
    slowestHitInterval: 520,
    averageTargetLifetime: 250,
    consistencyScore: 80,
    baseScoreTotal: 9_000,
    speedBonusTotal: 2_000,
    comboBonusTotal: 700,
    stabilityBonusTotal: 300,
    currentPace: 12_000,
    projectedFinalScore: 12_000,
    personalBestDeltaPercent: 0,
    hitIntervals: [],
    timeline: [],
    ...overrides,
  };
}

function cloudSummary(overrides: Partial<TrainingSessionSummaryResponse> = {}): TrainingSessionSummaryResponse {
  return {
    id: "server-session-1",
    clientSessionId: "session-1",
    trainingId: "grid-shot",
    modeVersion: 1,
    scoringVersion: 1,
    configurationKey: "grid-shot:60s:medium",
    sessionType: "benchmark",
    startedAt: "2026-07-14T09:59:00.000Z",
    completedAt: "2026-07-14T10:00:00.000Z",
    durationMs: 60_000,
    score: 12_000,
    hits: 90,
    misses: 10,
    accuracy: 90,
    targetsPerMinute: 90,
    averageHitInterval: 300,
    consistencyScore: 80,
    maxCombo: 20,
    grade: "A",
    integrityStatus: "VALID",
    analysisDataVersion: "version-1",
    ...overrides,
  };
}

describe("Grid Shot career aggregation", () => {
  it("deduplicates a synced local record and keeps it as a detail fallback", () => {
    const local = localRecord();
    const sessions = mergeGridShotCareerSessions([cloudSummary()], [local]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].source).toBe("cloud");
    expect(sessions[0].localRecord).toBe(local);
  });

  it("sorts sessions newest first and builds a chronological trend", () => {
    const newest = localGridShotCareerSession(localRecord({
      id: "newest",
      sessionId: "newest",
      createdAt: "2026-07-14T12:00:00.000Z",
      score: 15_000,
    }));
    const oldest = localGridShotCareerSession(localRecord({
      id: "oldest",
      sessionId: "oldest",
      createdAt: "2026-07-14T08:00:00.000Z",
      score: 10_000,
    }));
    const overview = summarizeGridShotCareer([newest, oldest]);

    expect(overview.bestScorePerMinute).toBe(15_000);
    expect(overview.averageScorePerMinute).toBe(12_500);
    expect(overview.trend.map((point) => point.scorePerMinute)).toEqual([10_000, 15_000]);
  });

  it("keeps invalid sessions in the history count but excludes them from performance averages", () => {
    const valid = localGridShotCareerSession(localRecord({ sessionId: "valid", score: 10_000 }));
    const invalid = localGridShotCareerSession(localRecord({
      sessionId: "invalid",
      score: 99_999,
      integrity: { passed: false, errors: ["invalid"], checks: {} as never },
    }));
    const overview = summarizeGridShotCareer([invalid, valid]);

    expect(overview.totalSessions).toBe(2);
    expect(overview.validSessions).toBe(1);
    expect(overview.bestScorePerMinute).toBe(10_000);
    expect(overview.averageScorePerMinute).toBe(10_000);
  });

  it("normalizes score by duration and exposes comparable configuration counts", () => {
    const short = localGridShotCareerSession(localRecord({
      sessionId: "short",
      duration: 30,
      score: 6_000,
      configuration: { targetSize: "medium", activeTargetCount: 3 },
    }));
    const long = localGridShotCareerSession(localRecord({
      sessionId: "long",
      duration: 60,
      score: 10_000,
      configuration: { targetSize: "medium", activeTargetCount: 3 },
    }));
    const overview = summarizeGridShotCareer([short, long]);

    expect(overview.bestScorePerMinute).toBe(12_000);
    expect(overview.averageScorePerMinute).toBe(11_000);
    expect(overview.configurationCount).toBe(2);
    expect(overview.largestComparableSampleSize).toBe(1);
  });

  it("uses the target size stored with the session instead of the current setting", () => {
    const record = localRecord({ configuration: { targetSize: "large", activeTargetCount: 3 }, events: [] });
    const session = localGridShotCareerSession(record);
    const detail = localGridShotCareerDetail(session, "small");

    expect(detail?.configuration.targetSize).toBe("large");
    expect(detail?.analysisSnapshot.training.configurationKey).toContain(":large");
  });

  it("classifies sessions by their explicit training type", () => {
    expect(isGridShotBenchmarkSession(cloudGridShotCareerSession(cloudSummary()))).toBe(true);
    expect(isGridShotBenchmarkSession(cloudGridShotCareerSession(cloudSummary({
      sessionType: "practice",
    })))).toBe(false);
    expect(isGridShotBenchmarkSession(cloudGridShotCareerSession(cloudSummary({
      sessionType: "practice",
      configurationKey: "grid-shot:60s:medium",
    })))).toBe(false);
  });
});
