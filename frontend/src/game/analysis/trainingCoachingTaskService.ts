import { authenticatedRequest } from "../../features/auth/authApi";
import type { TrainingAnalysisTarget, TrainingAnalysisTargetOperator } from "./trainingAnalysis";

export type TrainingCoachingTaskStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type TrainingCoachingEvaluationStatus = "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED";

export interface TrainingCoachingTargetEvaluation {
  metric: string;
  label: string;
  operator: TrainingAnalysisTargetOperator;
  targetValue: number;
  unit: string;
  actualValue: number;
  passed: boolean;
}

export interface TrainingCoachingEvaluation {
  sessionId: string;
  status: TrainingCoachingEvaluationStatus;
  targets: TrainingCoachingTargetEvaluation[];
  evaluatedAt: string;
}

export interface TrainingCoachingTargetProgress {
  metric: string;
  label: string;
  operator: TrainingAnalysisTargetOperator;
  targetValue: number;
  unit: string;
  passCount: number;
  requiredPasses: number;
  latestValue: number | null;
  bestValue: number | null;
  achieved: boolean;
}

export interface TrainingCoachingProgress {
  attemptsCompleted: number;
  maxAttempts: number;
  remainingAttempts: number;
  requiredPasses: number;
  targets: TrainingCoachingTargetProgress[];
  attempts: TrainingCoachingEvaluation[];
}

export interface TrainingCoachingTask {
  id: string;
  status: TrainingCoachingTaskStatus;
  sourceAnalysisCallId: string;
  title: string;
  description: string;
  configurationKey: string;
  modeVersion: number;
  scoringVersion: number;
  targets: TrainingAnalysisTarget[];
  activatedAt: string;
  progress: TrainingCoachingProgress;
  evaluation: TrainingCoachingEvaluation | null;
}

export function formatCoachingValue(value: number, unit: string) {
  const digits = Number.isInteger(value) ? 0 : 1;
  const gap = unit === "%" || unit === "ms" ? "" : " ";
  return `${value.toFixed(digits)}${gap}${unit}`;
}

export function formatCoachingTarget(target: Pick<TrainingAnalysisTarget, "operator" | "value" | "unit">) {
  return `${target.operator === "AT_LEAST" ? "≥" : "≤"} ${formatCoachingValue(target.value, target.unit)}`;
}

export async function getTrainingCoachingTask(trainingId: "grid-shot") {
  const response = await authenticatedRequest<TrainingCoachingTask | null>(
    `/api/training/career/${trainingId}/coaching-task`,
  );
  return response.data;
}

export async function adoptTrainingCoachingTask(trainingId: "grid-shot", analysisCallId: string) {
  const response = await authenticatedRequest<TrainingCoachingTask>(
    `/api/training/career/${trainingId}/coaching-task`,
    { method: "POST", body: JSON.stringify({ analysisCallId }) },
  );
  return response.data;
}
