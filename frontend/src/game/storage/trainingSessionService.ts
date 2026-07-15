import { authenticatedRequest } from "../../features/auth/authApi";
import type { TrainingAnalysisResult } from "../analysis/trainingAnalysis";

const RETIRED_LOCAL_TRAINING_KEYS = [
  "neon-grid-shot-history-v1",
  "neon-grid-shot-history-v2",
  "neon-training-upload-queue-v1",
  "neon-training-upload-queue-v2",
] as const;

export type TrainingSessionSaveStatus =
  | "idle"
  | "saving"
  | "saved-cloud"
  | "login-required"
  | "failed";

export type TrainingSessionType = "benchmark" | "practice";
export type TrainingJsonObject = Record<string, unknown>;

export interface TrainingSessionSummaryPayload {
  score: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsPerMinute: number;
  averageHitInterval: number;
  consistencyScore: number;
  maxCombo: number;
  grade: string;
}

/** Generic wire contract. Project adapters own the shape of configuration, detail, and analysisSnapshot. */
export interface TrainingSessionSubmission<
  TConfiguration extends TrainingJsonObject = TrainingJsonObject,
  TDetail extends TrainingJsonObject = TrainingJsonObject,
  TAnalysisSnapshot extends TrainingJsonObject = TrainingJsonObject,
> {
  clientSessionId: string;
  trainingId: string;
  modeVersion: number;
  scoringVersion: number;
  configurationKey: string;
  sessionType: TrainingSessionType;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  configuration: TConfiguration;
  summary: TrainingSessionSummaryPayload;
  detail: TDetail;
  analysisSnapshot: TAnalysisSnapshot;
  integrity: {
    passed: boolean;
    errors: string[];
  };
}

export interface TrainingSessionSummaryResponse {
  id: string;
  clientSessionId: string;
  trainingId: string;
  modeVersion: number;
  scoringVersion: number;
  configurationKey: string;
  sessionType: TrainingSessionType;
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

export interface TrainingSessionDetailResponse<
  TConfiguration = TrainingJsonObject,
  TDetail = TrainingJsonObject,
  TAnalysisSnapshot = TrainingJsonObject,
> {
  summary: TrainingSessionSummaryResponse;
  configuration: TConfiguration;
  detail: TDetail;
  analysisSnapshot: TAnalysisSnapshot;
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

export function clearRetiredLocalTrainingData() {
  try {
    RETIRED_LOCAL_TRAINING_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in hardened browser contexts. Career data remains cloud-only.
  }
}

async function uploadSession(submission: TrainingSessionSubmission) {
  return authenticatedRequest<TrainingSessionDetailResponse>("/api/training/sessions", {
    method: "POST",
    body: JSON.stringify(submission),
  });
}

export async function listTrainingSessions(trainingId: string, page = 0, size = 100) {
  const query = new URLSearchParams({ trainingId, page: String(page), size: String(size) });
  const response = await authenticatedRequest<TrainingSessionPageResponse>(`/api/training/sessions?${query}`);
  return response.data;
}

export async function listAllTrainingSessions(trainingId: string) {
  const first = await listTrainingSessions(trainingId, 0, 100);
  if (first.totalPages <= 1) return first.items;
  const remaining = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) => listTrainingSessions(trainingId, index + 1, 100)),
  );
  return [first, ...remaining].flatMap((page) => page.items);
}

export async function getTrainingSessionDetail<
  TConfiguration = TrainingJsonObject,
  TDetail = TrainingJsonObject,
  TAnalysisSnapshot = TrainingJsonObject,
>(sessionId: string) {
  const response = await authenticatedRequest<TrainingSessionDetailResponse<TConfiguration, TDetail, TAnalysisSnapshot>>(
    `/api/training/sessions/${encodeURIComponent(sessionId)}`,
  );
  return response.data;
}

/** Uploads an already project-built payload. Training results are never persisted in browser storage. */
export async function saveTrainingSessionSubmission(
  submission: TrainingSessionSubmission,
  authenticated: boolean,
): Promise<TrainingSessionSaveResult> {
  if (!authenticated) return { status: "login-required", sessionId: submission.clientSessionId };
  try {
    const response = await uploadSession(submission);
    return {
      status: "saved-cloud",
      sessionId: submission.clientSessionId,
      serverSessionId: response.data.summary.id,
    };
  } catch {
    return { status: "failed", sessionId: submission.clientSessionId };
  }
}
