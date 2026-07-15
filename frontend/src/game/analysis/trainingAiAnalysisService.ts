import { authenticatedRequest } from "../../features/auth/authApi";
import type { TrainingAnalysisResult } from "./trainingAnalysis";

export type TrainingAiJobStatus = "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED" | "BUDGET_EXHAUSTED";
export type TrainingAiConfidence = "SINGLE_SESSION" | "DEVELOPING" | "ESTABLISHED";

export interface TrainingAiJob {
  callId: string | null;
  status: TrainingAiJobStatus;
  cacheHit: boolean;
  providerId: string | null;
  model: string | null;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  confidence?: TrainingAiConfidence;
  comparisonSampleSize?: number;
  analysis: TrainingAnalysisResult;
  createdAt: string | null;
  completedAt: string | null;
}

export async function triggerTrainingAiAnalysis(sessionId: string) {
  const response = await authenticatedRequest<TrainingAiJob>(`/api/training/sessions/${sessionId}/ai-analysis`, {
    method: "POST",
  });
  return response.data;
}

export async function getTrainingAiAnalysis(sessionId: string) {
  const response = await authenticatedRequest<TrainingAiJob>(`/api/training/sessions/${sessionId}/ai-analysis`);
  return response.data;
}
