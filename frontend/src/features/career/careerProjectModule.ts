import type { ReactNode } from "react";
import type {
  CareerOverviewInsight,
  CareerOverviewProject,
  CareerOverviewSession,
  CareerOverviewTrendLabels,
  CareerOverviewTrendPoint,
  CareerTrendDirection,
} from "./careerOverviewModel";
import type {
  CareerCapabilityCode,
  CareerProjectDefinition,
} from "./careerProjectDefinition";

export interface CareerProjectSession {
  key: string;
  projectId: string;
  trainingId: string;
  completedAt: string;
  durationMs: number;
  sessionType: "benchmark" | "practice";
}

export interface CareerProjectTrainingEntry {
  id: string;
  label: readonly [zh: string, en: string];
}

export interface CareerProjectDataset {
  sessions: readonly CareerProjectSession[];
  payload: unknown;
  notice: string | null;
}

export interface CareerProjectLoadContext {
  authenticated: boolean;
  isAdmin: boolean;
  settings: unknown;
}

export interface CareerCapabilityEvidence {
  code: CareerCapabilityCode;
  label: string;
  observed: boolean;
  value: string;
  note: string;
  trend: CareerTrendDirection;
  confidence: number;
  normalizedScore?: number;
}

export interface CareerProjectContribution {
  project: CareerOverviewProject;
  updatedAt: string | null;
  totalSessions: number;
  totalDurationMs: number;
  activity: Array<Pick<CareerProjectSession, "completedAt" | "durationMs">>;
  abilities: CareerCapabilityEvidence[];
  recentSessions: CareerOverviewSession[];
  trend: CareerOverviewTrendPoint[];
  trendLabels?: CareerOverviewTrendLabels;
  insight: CareerOverviewInsight;
}

export interface CareerProjectProfileRenderProps {
  dataset: CareerProjectDataset;
  loading: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  settings: unknown;
  onBack: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionKey: string) => void;
  onStartTraining: (entryId: string) => void;
  onBrowseTraining: () => void;
}

export interface CareerSessionReviewRequest {
  initialDetail: unknown | null;
  remoteDetail?: Promise<unknown>;
  missingDetailMessage: string;
  remoteErrorMessage: string;
}

export interface CareerSessionReviewRenderProps {
  session: CareerProjectSession;
  detail: unknown | null;
  loading: boolean;
  error: string | null;
  backLabel: readonly [zh: string, en: string];
  onBack: () => void;
  onRetry?: () => void;
}

export interface CareerProjectModule {
  definition: CareerProjectDefinition;
  trainingEntries: readonly CareerProjectTrainingEntry[];
  loadLocal(context: CareerProjectLoadContext): CareerProjectDataset;
  loadRemote(local: CareerProjectDataset, context: CareerProjectLoadContext): Promise<CareerProjectDataset>;
  isBenchmarkSession(session: CareerProjectSession): boolean;
  buildContribution(dataset: CareerProjectDataset): CareerProjectContribution;
  renderProfile(props: CareerProjectProfileRenderProps): ReactNode;
  prepareSessionReview(
    session: CareerProjectSession,
    dataset: CareerProjectDataset,
    settings: unknown,
  ): CareerSessionReviewRequest;
  renderSessionReview(props: CareerSessionReviewRenderProps): ReactNode;
}
