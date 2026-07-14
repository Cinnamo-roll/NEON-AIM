export const TRAINING_ANALYSIS_SCHEMA_VERSION = 1;

export const TRAINING_ANALYSIS_LIMITS = {
  maxWindows: 6,
  maxSignals: 5,
  maxEvidenceFields: 6,
  sessionInputTokenBudget: 900,
  sessionOutputTokenBudget: 260,
  careerInputTokenBudget: 1_800,
  careerOutputTokenBudget: 450,
} as const;

export type TrainingAnalysisScope = "session" | "career";
export type TrainingAnalysisSignalSeverity = "positive" | "opportunity" | "warning";

export interface TrainingAnalysisSummary {
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

export interface TrainingAnalysisWindow {
  label: string;
  startMs: number;
  endMs: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsPerMinute: number;
  averageHitInterval: number;
  consistencyScore: number;
  score: number;
}

export interface TrainingAnalysisSignal {
  code: string;
  severity: TrainingAnalysisSignalSeverity;
  evidence: Record<string, number>;
}

export interface TrainingAnalysisBaseline {
  sampleSize: number;
  averageScore: number;
  averageAccuracy: number;
  averageTargetsPerMinute: number;
  averageConsistencyScore: number;
}

export interface TrainingAnalysisComparison {
  sampleSize: number;
  scoreDeltaPercent: number;
  accuracyDelta: number;
  targetsPerMinuteDelta: number;
  consistencyDelta: number;
}

export interface TrainingSessionAnalysisSnapshot {
  schemaVersion: typeof TRAINING_ANALYSIS_SCHEMA_VERSION;
  scope: "session";
  training: {
    id: string;
    modeVersion: number;
    scoringVersion: number;
    configurationKey: string;
  };
  source: {
    sessionId: string;
    completedAt: string;
  };
  summary: TrainingAnalysisSummary;
  windows: TrainingAnalysisWindow[];
  signals: TrainingAnalysisSignal[];
  comparison?: TrainingAnalysisComparison;
  integrity: {
    passed: boolean;
    errors: string[];
  };
}

export type TrainingAnalysisResultStatus = "PENDING" | "READY" | "FALLBACK" | "FAILED";
export type TrainingAnalysisResultSource = "RULES" | "AI";
export type TrainingAnalysisFindingSeverity = "POSITIVE" | "OPPORTUNITY" | "WARNING";
export type TrainingAnalysisTargetOperator = "AT_LEAST" | "AT_MOST";

export interface TrainingAnalysisFinding {
  code: string;
  severity: TrainingAnalysisFindingSeverity;
  title: string;
  evidence: string;
  advice: string;
}

export interface TrainingAnalysisTarget {
  metric: string;
  label: string;
  operator: TrainingAnalysisTargetOperator;
  value: number;
  unit: string;
}

export interface TrainingAnalysisNextAction {
  title: string;
  description: string;
  targets: TrainingAnalysisTarget[];
}

/** Stable result contract shared by zero-token rules and future AI providers. */
export interface TrainingAnalysisResult {
  schemaVersion: 1;
  status: TrainingAnalysisResultStatus;
  source: TrainingAnalysisResultSource;
  engineVersion: string;
  providerId: string | null;
  model: string | null;
  promptVersion: string | null;
  headline: string;
  summary: string;
  findings: TrainingAnalysisFinding[];
  nextAction: TrainingAnalysisNextAction;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  generatedAt: string;
}
