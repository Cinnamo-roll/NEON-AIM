import { authenticatedRequest } from "../../features/auth/authApi";

export type TrainingCareerProfileConfidence = "EMPTY" | "OBSERVING" | "INITIAL" | "DEVELOPING" | "STABLE";
export type TrainingCareerMetricDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type TrainingCareerTrend = "INSUFFICIENT" | "IMPROVING" | "STABLE" | "DECLINING";

export interface TrainingCareerMetricProfile {
  code: string;
  unit: string;
  direction: TrainingCareerMetricDirection;
  current: number | null;
  lifetimeAverage: number | null;
  best: number | null;
  delta: number | null;
  trend: TrainingCareerTrend;
}

export interface TrainingCareerDimensionProfile {
  code: string;
  primaryMetric: string;
  trend: TrainingCareerTrend;
  metrics: TrainingCareerMetricProfile[];
}

export interface TrainingCareerProfile {
  schemaVersion: number;
  profileVersion: string;
  dataVersion: string;
  trainingId: string;
  cohort: {
    configurationKey: string;
    modeVersion: number;
    scoringVersion: number;
  } | null;
  sample: {
    totalSessions: number;
    validSessions: number;
    comparableSessions: number;
    configurationCount: number;
    confidence: TrainingCareerProfileConfidence;
  };
  coverage: {
    availableDimensions: number;
    totalDimensions: number;
    capabilityCodes: string[];
  };
  dimensions: TrainingCareerDimensionProfile[];
  recentSessionIds: string[];
  updatedAt: string | null;
  generatedAt: string;
}

export async function getTrainingCareerProfile(trainingId = "grid-shot") {
  const response = await authenticatedRequest<TrainingCareerProfile>(
    `/api/training/career/${encodeURIComponent(trainingId)}/profile`,
  );
  return response.data;
}
