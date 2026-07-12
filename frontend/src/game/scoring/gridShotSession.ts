import {
  analyzeGridShotEvents,
  type GridShotAnalytics,
  type GridShotEvent,
} from "../modes/gridShot/gridShotAnalytics";
import type { GridShotHistoryRecord, GridShotSessionStats } from "../types/training";
import { scoreGridShotHit, type HitScoreBreakdown } from "./gridShotScoring";

export interface GridShotEventMetadata {
  timestamp?: number;
  elapsedMs?: number;
  targetId?: number;
  targetActivatedAt?: number;
  simulateInterval?: boolean;
}

const eventId = () => crypto.randomUUID();

function timelineFromAnalytics(analytics: GridShotAnalytics) {
  return analytics.timeline.map((point) => ({
    time: point.time,
    score: point.score,
    accuracy: point.accuracy,
    tpm: point.targetsPerMinute,
    combo: point.combo,
  }));
}

function applyAnalytics(
  stats: GridShotSessionStats,
  activeDurationMs: number,
  personalBest: number,
) {
  const analytics = analyzeGridShotEvents(stats.events, {
    sessionDurationMs: stats.sessionDurationMs,
    activeDurationMs,
  });
  stats.score = analytics.score;
  stats.shots = analytics.shots;
  stats.hits = analytics.hits;
  stats.misses = analytics.misses;
  stats.accuracy = analytics.accuracy;
  stats.maxCombo = analytics.maxCombo;
  stats.combo = stats.events.at(-1)?.comboAfter ?? 0;
  stats.averageHitInterval = analytics.averageHitInterval;
  stats.medianHitInterval = analytics.medianHitInterval;
  stats.fastestHitInterval = analytics.fastestHitInterval;
  stats.slowestHitInterval = analytics.slowestHitInterval;
  stats.averageReactionTime = analytics.averageHitInterval;
  stats.fastestReactionTime = analytics.fastestHitInterval;
  stats.averageTargetLifetime = analytics.averageTargetLifetime;
  stats.consistencyScore = analytics.consistencyScore;
  stats.baseScoreTotal = analytics.baseScoreTotal;
  stats.speedBonusTotal = analytics.speedBonusTotal;
  stats.comboBonusTotal = analytics.comboBonusTotal;
  stats.stabilityBonusTotal = analytics.stabilityBonusTotal;
  stats.targetsPerMinute = analytics.targetsPerMinute;
  stats.hitIntervals = [...analytics.hitIntervals];
  stats.phases = analytics.phases.map((phase) => ({ ...phase })) as GridShotSessionStats["phases"];
  stats.timeline = timelineFromAnalytics(analytics);
  stats.scoreTimeline = analytics.timeline.map((point) => ({ time: point.time, score: point.score }));
  stats.integrity = analytics.integrity;
  stats.gradeDetails = analytics.grade;
  const elapsedSeconds = Math.max(0.1, activeDurationMs / 1000);
  const durationSeconds = stats.sessionDurationMs / 1000;
  stats.elapsedTime = activeDurationMs / 1000;
  stats.projectedFinalScore = stats.score / elapsedSeconds * durationSeconds;
  stats.currentPace = stats.projectedFinalScore;
  if (personalBest) stats.personalBestDeltaPercent = (stats.projectedFinalScore - personalBest) / personalBest * 100;
}

export function createEmptyGridShotStats(
  sessionId: string = crypto.randomUUID(),
  durationSeconds = 60,
): GridShotSessionStats {
  const sessionDurationMs = Math.max(0, durationSeconds * 1000);
  const analytics = analyzeGridShotEvents([], { sessionDurationMs, activeDurationMs: 0 });
  return {
    sessionId,
    sessionDurationMs,
    events: [],
    phases: analytics.phases,
    integrity: analytics.integrity,
    gradeDetails: analytics.grade,
    score: 0,
    shots: 0,
    hits: 0,
    misses: 0,
    accuracy: 0,
    combo: 0,
    maxCombo: 0,
    averageReactionTime: 0,
    fastestReactionTime: 0,
    targetsPerMinute: 0,
    elapsedTime: 0,
    scoreTimeline: [{ time: 0, score: 0 }],
    averageHitInterval: 0,
    medianHitInterval: 0,
    fastestHitInterval: 0,
    slowestHitInterval: 0,
    averageTargetLifetime: 0,
    consistencyScore: 0,
    baseScoreTotal: 0,
    speedBonusTotal: 0,
    comboBonusTotal: 0,
    stabilityBonusTotal: 0,
    currentPace: 0,
    projectedFinalScore: 0,
    personalBestDeltaPercent: 0,
    hitIntervals: [],
    timeline: [{ time: 0, score: 0, accuracy: 0, tpm: 0, combo: 0 }],
  };
}

export function refreshGridShotStats(
  stats: GridShotSessionStats,
  activeDurationMs: number,
  personalBest: number,
) {
  applyAnalytics(stats, activeDurationMs, personalBest);
  return stats;
}

export function applyGridShotHit(
  stats: GridShotSessionStats,
  requestedInterval: number | null,
  reaction: number,
  duration: number,
  personalBest: number,
  metadata: GridShotEventMetadata = {},
): HitScoreBreakdown {
  stats.sessionDurationMs = Math.max(0, duration * 1000);
  const previousHit = [...stats.events].reverse().find((event) => event.type === "hit");
  const previousEvent = stats.events.at(-1);
  const requestedElapsed = Math.max(0, metadata.elapsedMs ?? stats.elapsedTime * 1000);
  const simulatedElapsed = metadata.simulateInterval && previousHit && requestedInterval !== null
    ? previousHit.elapsedMs + Math.max(0, requestedInterval)
    : requestedElapsed;
  const elapsedMs = Math.max(previousEvent?.elapsedMs ?? 0, simulatedElapsed);
  const interval = previousHit ? Math.max(0, elapsedMs - previousHit.elapsedMs) : null;
  const comboBefore = stats.events.at(-1)?.comboAfter ?? 0;
  const comboAfter = comboBefore + 1;
  const priorIntervals = stats.events
    .filter((event) => event.type === "hit" && event.hitIntervalMs !== undefined)
    .map((event) => event.hitIntervalMs as number);
  if (interval !== null) priorIntervals.push(interval);
  const scored = scoreGridShotHit(interval, comboAfter, priorIntervals);
  const timestamp = metadata.timestamp ?? performance.now();
  const targetActivatedAt = metadata.targetActivatedAt;
  const event: GridShotEvent = {
    id: eventId(),
    sessionId: stats.sessionId,
    timestamp,
    elapsedMs,
    type: "hit",
    targetId: metadata.targetId,
    targetActivatedAt,
    targetLifetimeMs: targetActivatedAt === undefined ? Math.max(0, reaction) : Math.max(0, timestamp - targetActivatedAt),
    previousHitAt: previousHit?.elapsedMs,
    hitIntervalMs: interval ?? undefined,
    comboBefore,
    comboAfter,
    baseScore: scored.base,
    speedBonus: scored.speedBonus,
    comboBonus: scored.comboBonus,
    stabilityBonus: scored.stabilityBonus,
    totalScore: scored.total,
  };
  stats.events.push(event);
  applyAnalytics(stats, Math.max(stats.elapsedTime * 1000, elapsedMs), personalBest);
  return scored;
}

export function applyGridShotMiss(
  stats: GridShotSessionStats,
  metadata: Pick<GridShotEventMetadata, "timestamp" | "elapsedMs"> = {},
) {
  const comboBefore = stats.events.at(-1)?.comboAfter ?? 0;
  const elapsedMs = Math.max(stats.events.at(-1)?.elapsedMs ?? 0, metadata.elapsedMs ?? stats.elapsedTime * 1000);
  const event: GridShotEvent = {
    id: eventId(),
    sessionId: stats.sessionId,
    timestamp: metadata.timestamp ?? performance.now(),
    elapsedMs: Math.max(0, elapsedMs),
    type: "miss",
    comboBefore,
    comboAfter: 0,
    baseScore: 0,
    speedBonus: 0,
    comboBonus: 0,
    stabilityBonus: 0,
    totalScore: 0,
  };
  stats.events.push(event);
  applyAnalytics(stats, Math.max(stats.elapsedTime * 1000, event.elapsedMs), 0);
}

export function createGridShotRecord(stats: GridShotSessionStats, duration: number): GridShotHistoryRecord {
  refreshGridShotStats(stats, duration * 1000, 0);
  return {
    ...stats,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    duration,
    grade: stats.gradeDetails.grade,
    events: stats.events.map((event) => ({ ...event })),
    phases: stats.phases.map((phase) => ({ ...phase })) as GridShotSessionStats["phases"],
    integrity: { ...stats.integrity, errors: [...stats.integrity.errors], checks: { ...stats.integrity.checks } },
    gradeDetails: {
      ...stats.gradeDetails,
      subscores: { ...stats.gradeDetails.subscores },
      subgrades: { ...stats.gradeDetails.subgrades },
      hardGates: {
        S: { ...stats.gradeDetails.hardGates.S, failed: [...stats.gradeDetails.hardGates.S.failed], requirements: { ...stats.gradeDetails.hardGates.S.requirements } },
        "S+": { ...stats.gradeDetails.hardGates["S+"], failed: [...stats.gradeDetails.hardGates["S+"].failed], requirements: { ...stats.gradeDetails.hardGates["S+"].requirements } },
      },
      limitedBy: [...stats.gradeDetails.limitedBy],
    },
    scoreTimeline: [...stats.scoreTimeline],
    hitIntervals: [...stats.hitIntervals],
    timeline: [...stats.timeline],
  };
}
