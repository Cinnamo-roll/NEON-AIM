import type {
  TrainingAnalysisResult,
  TrainingSessionAnalysisSnapshot,
} from "../analysis/trainingAnalysis";
import {
  buildGridShotAnalysisBundle,
  type GridShotDetailSegment,
} from "../modes/gridShot/gridShotAnalysisSnapshot";
import {
  isGridShotBenchmarkConfiguration,
  type GridShotTargetSize,
  type GridShotSessionType,
} from "../modes/gridShot/gridShotConfig";
import type { GridShotEvent } from "../modes/gridShot/gridShotAnalytics";
import type {
  TrainingSessionDetailResponse,
  TrainingSessionSummaryResponse,
} from "../storage/trainingSessionService";
import type { GridShotHistoryRecord } from "../types/training";

export type GridShotCareerSessionSource = "cloud" | "local";

export interface GridShotCareerSession {
  key: string;
  source: GridShotCareerSessionSource;
  serverId?: string;
  clientSessionId: string;
  completedAt: string;
  startedAt: string;
  durationMs: number;
  score: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsPerMinute: number;
  averageHitInterval: number;
  consistencyScore: number;
  maxCombo: number;
  grade: string;
  integrityStatus: "VALID" | "INVALID";
  modeVersion: number;
  scoringVersion: number;
  configurationKey: string;
  sessionType: GridShotSessionType;
  localRecord?: GridShotHistoryRecord;
}

export interface GridShotCareerOverview {
  totalSessions: number;
  validSessions: number;
  totalDurationMs: number;
  bestScorePerMinute: number;
  averageScorePerMinute: number;
  averageAccuracy: number;
  averageTargetsPerMinute: number;
  averageConsistencyScore: number;
  bestCombo: number;
  configurationCount: number;
  largestComparableSampleSize: number;
  recentScoreDeltaPercent: number | null;
  recentAccuracyDelta: number | null;
  trend: Array<{
    id: string;
    order: number;
    completedAt: string;
    scorePerMinute: number;
    accuracy: number;
    targetsPerMinute: number;
    consistencyScore: number;
  }>;
}

export interface GridShotCareerDetail {
  session: GridShotCareerSession;
  configuration: Record<string, string | number>;
  segments: GridShotDetailSegment[];
  events: GridShotEvent[];
  analysisSnapshot: TrainingSessionAnalysisSnapshot;
  analysis: TrainingAnalysisResult | null;
  integrityErrors: string[];
}

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const average = (values: readonly number[]) => values.length
  ? values.reduce((sum, value) => sum + finite(value), 0) / values.length
  : 0;

function completedTime(session: Pick<GridShotCareerSession, "completedAt">) {
  const time = new Date(session.completedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function gridShotScorePerMinute(
  session: Pick<GridShotCareerSession, "score" | "durationMs">,
) {
  const minutes = finite(session.durationMs) / 60_000;
  return minutes > 0 ? finite(session.score) / minutes : 0;
}

export function isGridShotBenchmarkSession(
  session: Pick<GridShotCareerSession, "sessionType">,
) {
  return session.sessionType === "benchmark";
}

function scoreDelta(recent: readonly GridShotCareerSession[], previous: readonly GridShotCareerSession[]) {
  if (!recent.length || !previous.length) return null;
  const baseline = average(previous.map(gridShotScorePerMinute));
  if (baseline <= 0) return null;
  return (average(recent.map(gridShotScorePerMinute)) - baseline) / baseline * 100;
}

function accuracyDelta(recent: readonly GridShotCareerSession[], previous: readonly GridShotCareerSession[]) {
  if (!recent.length || !previous.length) return null;
  return average(recent.map((session) => session.accuracy))
    - average(previous.map((session) => session.accuracy));
}

export function localGridShotCareerSession(record: GridShotHistoryRecord): GridShotCareerSession {
  const clientSessionId = record.sessionId || record.id;
  const durationMs = Math.max(0, finite(record.duration) * 1_000);
  const completedAt = record.createdAt;
  const completedAtMs = new Date(completedAt).getTime();
  const configurationKey = `grid-shot:${record.duration}s:${record.configuration?.targetSize ?? "legacy-local"}`;
  const sessionType = record.sessionType ?? (isGridShotBenchmarkConfiguration(configurationKey, 1, 1) ? "benchmark" : "practice");
  return {
    key: `local:${clientSessionId}`,
    source: "local",
    clientSessionId,
    completedAt,
    startedAt: new Date((Number.isFinite(completedAtMs) ? completedAtMs : Date.now()) - durationMs).toISOString(),
    durationMs,
    score: finite(record.score),
    hits: Math.max(0, finite(record.hits)),
    misses: Math.max(0, finite(record.misses)),
    accuracy: finite(record.accuracy),
    targetsPerMinute: finite(record.targetsPerMinute),
    averageHitInterval: finite(record.averageHitInterval),
    consistencyScore: finite(record.consistencyScore),
    maxCombo: Math.max(0, finite(record.maxCombo)),
    grade: record.grade || "-",
    integrityStatus: record.integrity?.passed === false ? "INVALID" : "VALID",
    modeVersion: 1,
    scoringVersion: 1,
    configurationKey,
    sessionType,
    localRecord: record,
  };
}

export function cloudGridShotCareerSession(
  summary: TrainingSessionSummaryResponse,
  localRecord?: GridShotHistoryRecord,
): GridShotCareerSession {
  const sessionType = summary.sessionType ?? (isGridShotBenchmarkConfiguration(summary.configurationKey, summary.modeVersion, summary.scoringVersion) ? "benchmark" : "practice");
  return {
    key: `cloud:${summary.id}`,
    source: "cloud",
    serverId: summary.id,
    clientSessionId: summary.clientSessionId,
    completedAt: summary.completedAt,
    startedAt: summary.startedAt,
    durationMs: summary.durationMs,
    score: summary.score,
    hits: summary.hits,
    misses: summary.misses,
    accuracy: summary.accuracy,
    targetsPerMinute: summary.targetsPerMinute,
    averageHitInterval: summary.averageHitInterval,
    consistencyScore: summary.consistencyScore,
    maxCombo: summary.maxCombo,
    grade: summary.grade,
    integrityStatus: summary.integrityStatus,
    modeVersion: summary.modeVersion,
    scoringVersion: summary.scoringVersion,
    configurationKey: summary.configurationKey,
    sessionType,
    localRecord,
  };
}

export function mergeGridShotCareerSessions(
  cloud: readonly TrainingSessionSummaryResponse[],
  local: readonly GridShotHistoryRecord[],
) {
  const localByClientId = new Map(
    local.map((record) => [record.sessionId || record.id, record]),
  );
  const sessions = cloud.map((summary) => {
    const localRecord = localByClientId.get(summary.clientSessionId);
    localByClientId.delete(summary.clientSessionId);
    return cloudGridShotCareerSession(summary, localRecord);
  });
  for (const record of localByClientId.values()) sessions.push(localGridShotCareerSession(record));
  return sessions.sort((left, right) => completedTime(right) - completedTime(left));
}

export function summarizeGridShotCareer(
  sessions: readonly GridShotCareerSession[],
): GridShotCareerOverview {
  const valid = sessions.filter((session) => session.integrityStatus === "VALID");
  const recent = valid.slice(0, 5);
  const previous = valid.slice(5, 10);
  const trendSessions = [...valid]
    .sort((left, right) => completedTime(left) - completedTime(right))
    .slice(-16);
  const configurationSizes = new Map<string, number>();
  valid.forEach((session) => configurationSizes.set(
    session.configurationKey,
    (configurationSizes.get(session.configurationKey) ?? 0) + 1,
  ));
  const scoreRates = valid.map(gridShotScorePerMinute);
  return {
    totalSessions: sessions.length,
    validSessions: valid.length,
    totalDurationMs: sessions.reduce((sum, session) => sum + Math.max(0, finite(session.durationMs)), 0),
    bestScorePerMinute: Math.max(0, ...scoreRates),
    averageScorePerMinute: average(scoreRates),
    averageAccuracy: average(valid.map((session) => session.accuracy)),
    averageTargetsPerMinute: average(valid.map((session) => session.targetsPerMinute)),
    averageConsistencyScore: average(valid.map((session) => session.consistencyScore)),
    bestCombo: Math.max(0, ...valid.map((session) => finite(session.maxCombo))),
    configurationCount: configurationSizes.size,
    largestComparableSampleSize: Math.max(0, ...configurationSizes.values()),
    recentScoreDeltaPercent: scoreDelta(recent, previous),
    recentAccuracyDelta: accuracyDelta(recent, previous),
    trend: trendSessions.map((session, index) => ({
      id: session.key,
      order: index + 1,
      completedAt: session.completedAt,
      scorePerMinute: gridShotScorePerMinute(session),
      accuracy: session.accuracy,
      targetsPerMinute: session.targetsPerMinute,
      consistencyScore: session.consistencyScore,
    })),
  };
}

export function localGridShotCareerDetail(
  session: GridShotCareerSession,
  targetSize: GridShotTargetSize,
): GridShotCareerDetail | null {
  if (!session.localRecord) return null;
  const resolvedTargetSize = session.localRecord.configuration?.targetSize ?? targetSize;
  const bundle = buildGridShotAnalysisBundle(session.localRecord, { targetSize: resolvedTargetSize });
  return {
    session,
    configuration: {
      duration: session.localRecord.duration,
      targetSize: resolvedTargetSize,
      activeTargetCount: session.localRecord.configuration?.activeTargetCount ?? 3,
    },
    segments: bundle.detailSegments,
    events: session.localRecord.events ?? [],
    analysisSnapshot: bundle.aiSnapshot,
    analysis: null,
    integrityErrors: bundle.aiSnapshot.integrity.errors,
  };
}

export function cloudGridShotCareerDetail(
  session: GridShotCareerSession,
  response: TrainingSessionDetailResponse,
): GridShotCareerDetail {
  return {
    session,
    configuration: response.configuration,
    segments: response.detail.segments,
    events: response.detail.events,
    analysisSnapshot: response.analysisSnapshot,
    analysis: response.analysis,
    integrityErrors: response.integrityErrors,
  };
}
