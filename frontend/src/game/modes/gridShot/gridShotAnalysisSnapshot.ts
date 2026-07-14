import {
  TRAINING_ANALYSIS_LIMITS,
  TRAINING_ANALYSIS_SCHEMA_VERSION,
  type TrainingAnalysisBaseline,
  type TrainingAnalysisComparison,
  type TrainingAnalysisSignal,
  type TrainingAnalysisWindow,
  type TrainingSessionAnalysisSnapshot,
} from "../../analysis/trainingAnalysis";
import type { GridShotHistoryRecord } from "../../types/training";
import {
  analyzeGridShotEvents,
  calculateGridShotConsistency,
  type GridShotEvent,
} from "./gridShotAnalytics";
import {
  GRID_SHOT_MODE_VERSION,
  GRID_SHOT_SCORING_VERSION,
  type GridShotTargetSize,
} from "./gridShotConfig";

const DETAIL_SEGMENT_DURATION_MS = 5_000;

export interface GridShotDetailSegment extends Omit<TrainingAnalysisWindow, "label"> {
  index: number;
  maxCombo: number;
}

export interface GridShotAnalysisBundle {
  detailSegments: GridShotDetailSegment[];
  aiSnapshot: TrainingSessionAnalysisSnapshot;
}

export interface GridShotAnalysisOptions {
  targetSize: GridShotTargetSize;
  baseline?: TrainingAnalysisBaseline;
}

const round = (value: number, digits = 1) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function eventsInRange(events: readonly GridShotEvent[], startMs: number, endMs: number, final: boolean) {
  return events.filter((event) => (
    event.elapsedMs >= startMs && (final ? event.elapsedMs <= endMs : event.elapsedMs < endMs)
  ));
}

function summarizeWindow(
  events: readonly GridShotEvent[],
  startMs: number,
  endMs: number,
  label: string,
  final: boolean,
): TrainingAnalysisWindow {
  const windowEvents = eventsInRange(events, startMs, endMs, final);
  const hits = windowEvents.filter((event) => event.type === "hit");
  const misses = windowEvents.length - hits.length;
  const durationMs = Math.max(0, endMs - startMs);
  const intervals = hits
    .map((event) => event.hitIntervalMs)
    .filter((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0);
  return {
    label,
    startMs,
    endMs,
    hits: hits.length,
    misses,
    accuracy: round(windowEvents.length ? hits.length / windowEvents.length * 100 : 0),
    targetsPerMinute: round(durationMs ? hits.length / (durationMs / 60_000) : 0),
    averageHitInterval: round(intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0),
    consistencyScore: calculateGridShotConsistency(intervals, hits.length, misses),
    score: round(windowEvents.reduce((sum, event) => sum + event.totalScore, 0), 0),
  };
}

function buildDetailSegments(events: readonly GridShotEvent[], durationMs: number) {
  const segmentCount = Math.ceil(durationMs / DETAIL_SEGMENT_DURATION_MS);
  return Array.from({ length: segmentCount }, (_, index): GridShotDetailSegment => {
    const startMs = index * DETAIL_SEGMENT_DURATION_MS;
    const endMs = Math.min(durationMs, startMs + DETAIL_SEGMENT_DURATION_MS);
    const summary = summarizeWindow(events, startMs, endMs, `${startMs / 1_000}-${endMs / 1_000}s`, index === segmentCount - 1);
    const segmentEvents = eventsInRange(events, startMs, endMs, index === segmentCount - 1);
    return {
      index,
      startMs: summary.startMs,
      endMs: summary.endMs,
      hits: summary.hits,
      misses: summary.misses,
      accuracy: summary.accuracy,
      targetsPerMinute: summary.targetsPerMinute,
      averageHitInterval: summary.averageHitInterval,
      consistencyScore: summary.consistencyScore,
      score: summary.score,
      maxCombo: Math.max(0, ...segmentEvents.map((event) => event.comboAfter)),
    };
  });
}

function buildAnalysisWindows(events: readonly GridShotEvent[], durationMs: number) {
  const windows: TrainingAnalysisWindow[] = [];
  for (let index = 0; index < 3; index += 1) {
    const startMs = Math.round(durationMs * index / 3);
    const endMs = index === 2 ? durationMs : Math.round(durationMs * (index + 1) / 3);
    windows.push(summarizeWindow(events, startMs, endMs, `phase${index + 1}`, index === 2));
  }
  return windows.slice(0, TRAINING_ANALYSIS_LIMITS.maxWindows);
}

function buildComparison(
  summary: TrainingSessionAnalysisSnapshot["summary"],
  baseline?: TrainingAnalysisBaseline,
): TrainingAnalysisComparison | undefined {
  if (!baseline || baseline.sampleSize <= 0) return undefined;
  return {
    sampleSize: baseline.sampleSize,
    scoreDeltaPercent: round(baseline.averageScore > 0 ? (summary.score - baseline.averageScore) / baseline.averageScore * 100 : 0),
    accuracyDelta: round(summary.accuracy - baseline.averageAccuracy),
    targetsPerMinuteDelta: round(summary.targetsPerMinute - baseline.averageTargetsPerMinute),
    consistencyDelta: round(summary.consistencyScore - baseline.averageConsistencyScore),
  };
}

function buildSignals(
  summary: TrainingSessionAnalysisSnapshot["summary"],
  windows: readonly TrainingAnalysisWindow[],
  integrityPassed: boolean,
) {
  const signals: TrainingAnalysisSignal[] = [];
  const first = windows[0];
  const last = windows.at(-1);

  if (!integrityPassed) {
    signals.push({ code: "INTEGRITY_REVIEW_REQUIRED", severity: "warning", evidence: {} });
  }
  if (summary.accuracy < 85) {
    signals.push({
      code: "ACCURACY_LIMITS_PACE",
      severity: "opportunity",
      evidence: { accuracy: summary.accuracy, targetAccuracy: 90 },
    });
  }
  if (first && last && first.hits + first.misses >= 3 && last.hits + last.misses >= 3) {
    const accuracyDelta = round(last.accuracy - first.accuracy);
    if (accuracyDelta <= -5) {
      signals.push({
        code: "LATE_ACCURACY_DROP",
        severity: "opportunity",
        evidence: { firstAccuracy: first.accuracy, lastAccuracy: last.accuracy, accuracyDelta },
      });
    } else if (accuracyDelta >= 5 && last.targetsPerMinute >= first.targetsPerMinute) {
      signals.push({
        code: "STRONG_FINISH",
        severity: "positive",
        evidence: { firstAccuracy: first.accuracy, lastAccuracy: last.accuracy, accuracyDelta },
      });
    }
  }
  if (summary.hits >= 4 && summary.consistencyScore < 70) {
    signals.push({
      code: "RHYTHM_INSTABILITY",
      severity: "opportunity",
      evidence: { consistencyScore: summary.consistencyScore, targetConsistency: 75 },
    });
  }
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) {
    signals.push({
      code: "PACE_OPPORTUNITY",
      severity: "positive",
      evidence: { accuracy: summary.accuracy, averageHitInterval: summary.averageHitInterval },
    });
  }
  return signals.slice(0, TRAINING_ANALYSIS_LIMITS.maxSignals);
}

export function buildGridShotAnalysisBundle(
  record: GridShotHistoryRecord,
  options: GridShotAnalysisOptions,
): GridShotAnalysisBundle {
  const durationMs = Math.max(0, record.duration * 1_000);
  const events = [...(record.events ?? [])].sort((left, right) => left.elapsedMs - right.elapsedMs || left.timestamp - right.timestamp);
  const analytics = analyzeGridShotEvents(events, { sessionDurationMs: durationMs, activeDurationMs: durationMs });
  const windows = buildAnalysisWindows(events, durationMs);
  const summary: TrainingSessionAnalysisSnapshot["summary"] = {
    score: round(analytics.score, 0),
    hits: analytics.hits,
    misses: analytics.misses,
    accuracy: round(analytics.accuracy),
    targetsPerMinute: round(analytics.targetsPerMinute),
    averageHitInterval: round(analytics.averageHitInterval),
    consistencyScore: round(analytics.consistencyScore, 0),
    maxCombo: analytics.maxCombo,
    grade: analytics.grade.grade,
  };
  return {
    detailSegments: buildDetailSegments(events, durationMs),
    aiSnapshot: {
      schemaVersion: TRAINING_ANALYSIS_SCHEMA_VERSION,
      scope: "session",
      training: {
        id: "grid-shot",
        modeVersion: GRID_SHOT_MODE_VERSION,
        scoringVersion: GRID_SHOT_SCORING_VERSION,
        configurationKey: `grid-shot:${record.duration}s:${options.targetSize}`,
      },
      source: { sessionId: record.sessionId, completedAt: record.createdAt },
      summary,
      windows,
      signals: buildSignals(summary, windows, analytics.integrity.passed),
      comparison: buildComparison(summary, options.baseline),
      integrity: {
        passed: analytics.integrity.passed,
        errors: [...analytics.integrity.errors],
      },
    },
  };
}
