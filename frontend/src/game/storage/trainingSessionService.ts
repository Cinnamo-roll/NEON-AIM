import { authenticatedRequest } from "../../features/auth/authApi";
import type { TrainingAnalysisResult, TrainingSessionAnalysisSnapshot } from "../analysis/trainingAnalysis";
import { buildGridShotAnalysisBundle, type GridShotDetailSegment } from "../modes/gridShot/gridShotAnalysisSnapshot";
import {
  isGridShotBenchmarkConfiguration,
  type GridShotModeSettings,
  type GridShotSessionType,
} from "../modes/gridShot/gridShotConfig";
import type { GridShotEvent } from "../modes/gridShot/gridShotAnalytics";
import type { GridShotHistoryRecord } from "../types/training";
import { saveHistoryRecord } from "./trainingStorage";

const LEGACY_PENDING_UPLOAD_KEYS = ["neon-training-upload-queue-v1"];
const PENDING_UPLOAD_KEY = "neon-training-upload-queue-v2";
const MAX_PENDING_UPLOADS = 100;
let syncInFlight: Promise<TrainingSyncResult> | null = null;

export type TrainingSessionSaveStatus =
  | "idle"
  | "saving"
  | "saved-cloud"
  | "saved-local"
  | "pending-sync"
  | "failed";

export interface TrainingSessionSubmission {
  clientSessionId: string;
  trainingId: string;
  modeVersion: number;
  scoringVersion: number;
  configurationKey: string;
  sessionType: GridShotSessionType;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  configuration: Record<string, string | number>;
  summary: TrainingSessionAnalysisSnapshot["summary"];
  detail: {
    segments: GridShotDetailSegment[];
    events: NonNullable<GridShotHistoryRecord["events"]>;
  };
  analysisSnapshot: TrainingSessionAnalysisSnapshot;
  integrity: TrainingSessionAnalysisSnapshot["integrity"];
}

export interface TrainingSessionSummaryResponse {
  id: string;
  clientSessionId: string;
  trainingId: string;
  modeVersion: number;
  scoringVersion: number;
  configurationKey: string;
  sessionType: GridShotSessionType;
  startedAt: string;
  completedAt: string;
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
  analysisDataVersion: string;
}

export interface TrainingSessionDetailResponse {
  summary: TrainingSessionSummaryResponse;
  configuration: Record<string, string | number>;
  detail: {
    segments: GridShotDetailSegment[];
    events: GridShotEvent[];
  };
  analysisSnapshot: TrainingSessionAnalysisSnapshot;
  analysis: TrainingAnalysisResult | null;
  integrityErrors: string[];
  storedAt: string;
}

export interface TrainingSessionPageResponse {
  items: TrainingSessionSummaryResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface TrainingSessionSaveResult {
  status: TrainingSessionSaveStatus;
  sessionId: string;
  serverSessionId?: string;
}

export interface TrainingSyncResult {
  syncedSessionIds: string[];
  serverSessionIds: Record<string, string>;
  remaining: number;
}

function readPendingUploads(): TrainingSessionSubmission[] {
  try {
    LEGACY_PENDING_UPLOAD_KEYS.forEach((key) => localStorage.removeItem(key));
    const parsed = JSON.parse(localStorage.getItem(PENDING_UPLOAD_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed.slice(0, MAX_PENDING_UPLOADS) as Array<TrainingSessionSubmission & { sessionType?: GridShotSessionType }>).map((item) => ({
      ...item,
      sessionType: item.sessionType ?? (isGridShotBenchmarkConfiguration(item.configurationKey, item.modeVersion, item.scoringVersion) ? "benchmark" : "practice"),
    }));
  } catch {
    return [];
  }
}

function writePendingUploads(items: readonly TrainingSessionSubmission[]) {
  localStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(items.slice(0, MAX_PENDING_UPLOADS)));
}

function queueUpload(submission: TrainingSessionSubmission) {
  const pending = [submission, ...readPendingUploads().filter((item) => item.clientSessionId !== submission.clientSessionId)];
  writePendingUploads(pending);
}

function removePendingUpload(clientSessionId: string) {
  writePendingUploads(readPendingUploads().filter((item) => item.clientSessionId !== clientSessionId));
}

function buildSubmission(
  record: GridShotHistoryRecord,
  settings: GridShotModeSettings,
  sessionType: GridShotSessionType,
): TrainingSessionSubmission {
  const bundle = buildGridShotAnalysisBundle(record, { targetSize: settings.targetSize });
  const completedAt = new Date(record.createdAt);
  const durationMs = record.duration * 1_000;
  return {
    clientSessionId: record.sessionId,
    trainingId: bundle.aiSnapshot.training.id,
    modeVersion: bundle.aiSnapshot.training.modeVersion,
    scoringVersion: bundle.aiSnapshot.training.scoringVersion,
    configurationKey: bundle.aiSnapshot.training.configurationKey,
    sessionType,
    startedAt: new Date(completedAt.getTime() - durationMs).toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    configuration: {
      duration: record.duration,
      targetSize: settings.targetSize,
      activeTargetCount: 3,
    },
    summary: bundle.aiSnapshot.summary,
    detail: {
      segments: bundle.detailSegments,
      events: record.events ?? [],
    },
    analysisSnapshot: bundle.aiSnapshot,
    integrity: bundle.aiSnapshot.integrity,
  };
}

async function uploadSession(submission: TrainingSessionSubmission) {
  return authenticatedRequest<TrainingSessionDetailResponse>("/api/training/sessions", {
    method: "POST",
    body: JSON.stringify(submission),
  });
}

export async function listTrainingSessions(
  trainingId = "grid-shot",
  page = 0,
  size = 100,
) {
  const query = new URLSearchParams({ trainingId, page: String(page), size: String(size) });
  const response = await authenticatedRequest<TrainingSessionPageResponse>(`/api/training/sessions?${query}`);
  return response.data;
}

export async function listAllTrainingSessions(trainingId = "grid-shot") {
  const first = await listTrainingSessions(trainingId, 0, 100);
  if (first.totalPages <= 1) return first.items;
  const remaining = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) => listTrainingSessions(trainingId, index + 1, 100)),
  );
  return [first, ...remaining].flatMap((page) => page.items);
}

export async function getTrainingSessionDetail(sessionId: string) {
  const response = await authenticatedRequest<TrainingSessionDetailResponse>(
    `/api/training/sessions/${encodeURIComponent(sessionId)}`,
  );
  return response.data;
}

export async function saveGridShotTrainingSession(
  record: GridShotHistoryRecord,
  settings: GridShotModeSettings,
  sessionType: GridShotSessionType,
  authenticated: boolean,
): Promise<TrainingSessionSaveResult> {
  const storedRecord: GridShotHistoryRecord = {
    ...record,
    sessionType,
    configuration: {
      targetSize: settings.targetSize,
      activeTargetCount: 3,
    },
  };
  try {
    saveHistoryRecord(storedRecord);
  } catch {
    return { status: "failed", sessionId: record.sessionId };
  }
  let submission: TrainingSessionSubmission;
  try {
    submission = buildSubmission(storedRecord, settings, sessionType);
  } catch {
    return { status: "saved-local", sessionId: record.sessionId };
  }
  try {
    queueUpload(submission);
  } catch {
    return { status: "saved-local", sessionId: record.sessionId };
  }
  if (!authenticated) return { status: "saved-local", sessionId: record.sessionId };
  try {
    const response = await uploadSession(submission);
    removePendingUpload(submission.clientSessionId);
    return { status: "saved-cloud", sessionId: record.sessionId, serverSessionId: response.data.summary.id };
  } catch {
    return { status: "pending-sync", sessionId: record.sessionId };
  }
}

export async function syncPendingTrainingSessions(): Promise<TrainingSyncResult> {
  if (syncInFlight) return syncInFlight;
  const run = (async () => {
    const pending = readPendingUploads();
    const syncedSessionIds: string[] = [];
    const serverSessionIds: Record<string, string> = {};
    for (const submission of [...pending].reverse()) {
      try {
        const response = await uploadSession(submission);
        removePendingUpload(submission.clientSessionId);
        syncedSessionIds.push(submission.clientSessionId);
        serverSessionIds[submission.clientSessionId] = response.data.summary.id;
      } catch {
        break;
      }
    }
    return { syncedSessionIds, serverSessionIds, remaining: readPendingUploads().length };
  })();
  syncInFlight = run;
  try {
    return await run;
  } finally {
    if (syncInFlight === run) syncInFlight = null;
  }
}

export function pendingTrainingSessionCount() {
  return readPendingUploads().length;
}
