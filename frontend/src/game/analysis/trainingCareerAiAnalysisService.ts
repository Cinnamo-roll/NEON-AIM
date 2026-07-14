import { authenticatedRequest } from "../../features/auth/authApi";
import type { ModelProviderId } from "./modelApiSettings";
import type { TrainingAnalysisResult } from "./trainingAnalysis";

export type TrainingCareerAiConfidence = "INITIAL" | "LOW" | "STABLE";
export type TrainingCareerAiJobStatus = "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED" | "BUDGET_EXHAUSTED";

export interface TrainingCareerAiJob {
  callId: string | null;
  status: TrainingCareerAiJobStatus;
  cacheHit: boolean;
  stale: boolean;
  providerId: string | null;
  model: string | null;
  promptVersion: string | null;
  confidence: TrainingCareerAiConfidence;
  sampleSize: number;
  comparableSampleSize: number;
  configurationCount: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  analysis: TrainingAnalysisResult | null;
  createdAt: string | null;
  completedAt: string | null;
}

export async function triggerTrainingCareerAiAnalysis(
  trainingId: "grid-shot",
  provider: ModelProviderId,
  apiKey: string,
  model: string,
) {
  const response = await authenticatedRequest<TrainingCareerAiJob>(`/api/training/career/${trainingId}/ai-analysis`, {
    method: "POST",
    body: JSON.stringify({ provider, apiKey, model }),
  });
  return response.data;
}

export async function getTrainingCareerAiAnalysis(trainingId: "grid-shot") {
  const response = await authenticatedRequest<TrainingCareerAiJob>(`/api/training/career/${trainingId}/ai-analysis`);
  return response.data;
}
