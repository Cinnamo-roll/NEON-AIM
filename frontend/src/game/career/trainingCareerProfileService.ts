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
  code: "CLICK_PRECISION" | "TARGET_SWITCHING" | "RHYTHM_STABILITY" | "SUSTAINED_CONTROL";
  primaryMetric: string;
  trend: TrainingCareerTrend;
  metrics: TrainingCareerMetricProfile[];
}

export interface TrainingCareerProfile {
  schemaVersion: number;
  profileVersion: string;
  dataVersion: string;
  trainingId: string;
  benchmark: {
    configurationKey: string;
    modeVersion: number;
    scoringVersion: number;
    durationSeconds: number;
    targetSize: string;
    activeTargets: number;
  };
  sample: {
    totalSessions: number;
    validSessions: number;
    benchmarkSessions: number;
    freePracticeSessions: number;
    confidence: TrainingCareerProfileConfidence;
    nextMilestone: number;
    remaining: number;
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
