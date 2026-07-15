import type { CareerCapabilityCode, CareerProjectDefinition } from "./careerProjectRegistry";

export type CareerTrendDirection = "improving" | "stable" | "declining" | "observing";

export interface CareerOverviewAbility {
  code: CareerCapabilityCode;
  label: string;
  value: string;
  note: string;
  trend: CareerTrendDirection;
}

export interface CareerOverviewInsight {
  eyebrow: string;
  title: string;
  description: string;
}

export interface CareerOverviewProject {
  definition: CareerProjectDefinition;
  statusLabel: string;
  sessionCount: number;
  summary: string;
  trend: CareerTrendDirection;
  coreMetrics: Array<{
    code: string;
    label: string;
    value: string;
  }>;
}

export interface CareerOverviewSession {
  id: string;
  projectId: string;
  trainingId: string;
  projectName: string;
  completedAt: string;
  durationMs: number;
  sessionType: "benchmark" | "practice";
  context: string;
  primaryValue: string;
  secondaryValue: string;
  grade: string;
}

export interface CareerOverviewTrendPoint {
  order: number;
  completedAt: string;
  primary: number;
  secondary: number;
}

export interface CareerOverviewTrendLabels {
  primary: string;
  secondary: string;
}

export interface CareerOverviewModel {
  updatedAt: string | null;
  totalSessions: number;
  totalDurationMs: number;
  weeklySessions: number;
  weeklyDurationMs: number;
  insight: CareerOverviewInsight;
  abilities: CareerOverviewAbility[];
  projects: CareerOverviewProject[];
  recentSessions: CareerOverviewSession[];
  trend: CareerOverviewTrendPoint[];
  trendLabels: CareerOverviewTrendLabels;
}
