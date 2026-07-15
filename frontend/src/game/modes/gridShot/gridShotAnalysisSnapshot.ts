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
  targetSize: GridShotTargetSize;
}

export interface GridShotAnalysisOptions {
  targetSize?: GridShotTargetSize;
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
  const missEvents = windowEvents.filter((event) => event.type === "miss");
  const misses = missEvents.length;
  const attempts = hits.length + misses;
  const durationMs = Math.max(0, endMs - startMs);
  const intervals = hits.slice(1).map((event, index) => Math.max(0, event.elapsedMs - hits[index].elapsedMs));
  const targetLifetimes = hits
    .map((event) => event.targetLifetimeMs)
    .filter((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0);
  const averageInterval = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
  const orderedIntervals = [...intervals].sort((left, right) => left - right);
  const middle = Math.floor(orderedIntervals.length / 2);
  const medianInterval = orderedIntervals.length === 0
    ? 0
    : orderedIntervals.length % 2
      ? orderedIntervals[middle]
      : (orderedIntervals[middle - 1] + orderedIntervals[middle]) / 2;
  return {
    label,
    startMs,
    endMs,
    hits: hits.length,
    misses,
    accuracy: round(attempts ? hits.length / attempts * 100 : 0),
    targetsPerMinute: round(durationMs ? hits.length / (durationMs / 60_000) : 0),
    averageHitInterval: round(averageInterval),
    medianHitInterval: round(medianInterval),
    averageTargetLifetime: round(targetLifetimes.length
      ? targetLifetimes.reduce((sum, value) => sum + value, 0) / targetLifetimes.length
      : 0),
    consistencyScore: calculateGridShotConsistency(intervals, hits.length, misses),
    maxCombo: Math.max(0, ...windowEvents.map((event) => event.comboAfter)),
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
      medianHitInterval: summary.medianHitInterval,
      averageTargetLifetime: summary.averageTargetLifetime,
      consistencyScore: summary.consistencyScore,
      score: summary.score,
      maxCombo: Math.max(summary.maxCombo ?? 0, ...segmentEvents.map((event) => event.comboAfter)),
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
    return [{ code: "INTEGRITY_REVIEW_REQUIRED", severity: "warning", evidence: {} } satisfies TrainingAnalysisSignal];
  }
  if (summary.accuracy >= 90 && summary.consistencyScore >= 75) {
    signals.push({
      code: "CONTROL_FOUNDATION",
      severity: "positive",
      evidence: {
        accuracy: summary.accuracy,
        consistencyScore: summary.consistencyScore,
        maxCombo: summary.maxCombo,
      },
    });
  } else if (summary.maxCombo >= 8) {
    signals.push({
      code: "COMBO_STRENGTH",
      severity: "positive",
      evidence: { maxCombo: summary.maxCombo, hits: summary.hits },
    });
  }
  if (summary.accuracy < 85) {
    signals.push({
      code: "ACCURACY_LIMITS_PACE",
      severity: "opportunity",
      evidence: { accuracy: summary.accuracy, hits: summary.hits, misses: summary.misses },
    });
  }
  if (first && last && first.hits + first.misses >= 3 && last.hits + last.misses >= 3) {
    const accuracyDelta = round(last.accuracy - first.accuracy);
    const paceDelta = round(last.targetsPerMinute - first.targetsPerMinute);
    if (accuracyDelta <= -5) {
      signals.push({
        code: paceDelta >= 10 ? "PACE_CONTROL_TRADEOFF" : "LATE_ACCURACY_DROP",
        severity: "opportunity",
        evidence: {
          firstAccuracy: first.accuracy,
          lastAccuracy: last.accuracy,
          accuracyDelta,
          firstTargetsPerMinute: first.targetsPerMinute,
          lastTargetsPerMinute: last.targetsPerMinute,
          targetsPerMinuteDelta: paceDelta,
        },
      });
    } else if (accuracyDelta >= 5 && last.accuracy >= summary.accuracy
      && last.targetsPerMinute >= first.targetsPerMinute) {
      signals.push({
        code: "STRONG_FINISH",
        severity: "positive",
        evidence: {
          firstAccuracy: first.accuracy,
          lastAccuracy: last.accuracy,
          accuracyDelta,
          targetsPerMinuteDelta: paceDelta,
        },
      });
    } else if (paceDelta <= -Math.max(10, first.targetsPerMinute * 0.1) && accuracyDelta < 3) {
      signals.push({
        code: "LATE_PACE_DROP",
        severity: "opportunity",
        evidence: {
          firstTargetsPerMinute: first.targetsPerMinute,
          lastTargetsPerMinute: last.targetsPerMinute,
          targetsPerMinuteDelta: paceDelta,
          accuracyDelta,
        },
      });
    }
  }
  if (summary.hits >= 4 && summary.consistencyScore < 70) {
    signals.push({
      code: "RHYTHM_INSTABILITY",
      severity: "opportunity",
      evidence: {
        consistencyScore: summary.consistencyScore,
        averageHitInterval: summary.averageHitInterval,
        maxCombo: summary.maxCombo,
      },
    });
  }
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) {
    signals.push({
      code: "PACE_OPPORTUNITY",
      severity: "opportunity",
      evidence: {
        accuracy: summary.accuracy,
        averageHitInterval: summary.averageHitInterval,
        medianHitInterval: summary.medianHitInterval ?? summary.averageHitInterval,
      },
    });
  }
  if (!signals.some((signal) => signal.severity === "positive")) {
    const candidates = windows
      .map((window, index) => ({ window, index }))
      .filter(({ window }) => window.hits + window.misses >= 3)
      .sort((left, right) => right.window.accuracy - left.window.accuracy
        || right.window.targetsPerMinute - left.window.targetsPerMinute);
    const best = candidates[0];
    if (best) {
      signals.push({
        code: "BEST_PHASE_CONTROL",
        severity: "positive",
        evidence: {
          phase: best.index + 1,
          accuracy: best.window.accuracy,
          targetsPerMinute: best.window.targetsPerMinute,
          hits: best.window.hits,
          misses: best.window.misses,
        },
      });
    }
  }
  const opportunityScore = (signal: TrainingAnalysisSignal) => {
    if (signal.code === "RHYTHM_INSTABILITY") return (70 - summary.consistencyScore) / 70;
    if (signal.code === "ACCURACY_LIMITS_PACE") return (85 - summary.accuracy) / 25;
    if (signal.code === "LATE_ACCURACY_DROP") return Math.min(1, Math.abs(signal.evidence.accuracyDelta ?? 0) / 20);
    if (signal.code === "PACE_CONTROL_TRADEOFF") return Math.min(1, Math.abs(signal.evidence.accuracyDelta ?? 0) / 15);
    if (signal.code === "LATE_PACE_DROP") return Math.min(1, Math.abs(signal.evidence.targetsPerMinuteDelta ?? 0) / 40);
    if (signal.code === "PACE_OPPORTUNITY") return Math.max(0, (summary.averageHitInterval - 400) / 200);
    return 0;
  };
  const warnings = signals.filter((signal) => signal.severity === "warning");
  const positives = signals.filter((signal) => signal.severity === "positive");
  const opportunities = signals
    .filter((signal) => signal.severity === "opportunity")
    .sort((left, right) => opportunityScore(right) - opportunityScore(left));
  return [...warnings, ...positives.slice(0, 2), ...opportunities].slice(0, TRAINING_ANALYSIS_LIMITS.maxSignals);
}

export function buildGridShotAnalysisBundle(
  record: GridShotHistoryRecord,
  options: GridShotAnalysisOptions,
): GridShotAnalysisBundle {
  const durationMs = Math.max(0, record.duration * 1_000);
  const sourceEvents = record.events ?? [];
  const analytics = analyzeGridShotEvents(sourceEvents, {
    sessionDurationMs: durationMs,
    activeDurationMs: durationMs,
    sessionId: record.sessionId,
  });
  const events = [...sourceEvents].sort((left, right) => left.elapsedMs - right.elapsedMs || left.timestamp - right.timestamp);
  const windows = buildAnalysisWindows(events, durationMs);
  const targetSize = record.configuration?.targetSize ?? options.targetSize ?? "medium";
  const summary: TrainingSessionAnalysisSnapshot["summary"] = {
    score: round(analytics.score, 0),
    hits: analytics.hits,
    misses: analytics.misses,
    accuracy: round(analytics.accuracy),
    targetsPerMinute: round(analytics.targetsPerMinute),
    averageHitInterval: round(analytics.averageHitInterval),
    medianHitInterval: round(analytics.medianHitInterval),
    fastestHitInterval: round(analytics.fastestHitInterval),
    slowestHitInterval: round(analytics.slowestHitInterval),
    averageTargetLifetime: round(analytics.averageTargetLifetime),
    consistencyScore: round(analytics.consistencyScore, 0),
    maxCombo: analytics.maxCombo,
    grade: analytics.grade.grade,
  };
  return {
    detailSegments: buildDetailSegments(events, durationMs),
    targetSize,
    aiSnapshot: {
      schemaVersion: TRAINING_ANALYSIS_SCHEMA_VERSION,
      scope: "session",
      training: {
        id: "grid-shot",
        modeVersion: GRID_SHOT_MODE_VERSION,
        scoringVersion: GRID_SHOT_SCORING_VERSION,
        configurationKey: `grid-shot:${record.duration}s:${targetSize}`,
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
