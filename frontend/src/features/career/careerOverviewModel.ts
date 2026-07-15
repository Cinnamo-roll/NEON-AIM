import type { CareerCapabilityCode, CareerProjectDefinition } from "./careerProjectRegistry";

export type CareerTrendDirection = "improving" | "stable" | "declining" | "observing";

export interface CareerOverviewAbility {
  code: CareerCapabilityCode;
  label: string;
  value: string;
  note: string;
  trend: CareerTrendDirection;
}

export interface CareerOverviewGoal {
  eyebrow: string;
  title: string;
  description: string;
  completed: number;
  total: number;
  projectId?: string;
  entryId?: string;
  actionLabel: string;
}

export interface CareerOverviewProject {
  definition: CareerProjectDefinition;
  statusLabel: string;
  sessionCount: number;
  benchmarkCount: number;
  summary: string;
  trend: CareerTrendDirection;
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

export interface CareerOverviewModel {
  updatedAt: string | null;
  totalSessions: number;
  totalDurationMs: number;
  benchmarkSessions: number;
  practiceSessions: number;
  weeklySessions: number;
  weeklyDurationMs: number;
  weeklyBenchmarkSessions: number;
  weeklyPracticeSessions: number;
  goal: CareerOverviewGoal;
  abilities: CareerOverviewAbility[];
  projects: CareerOverviewProject[];
  recentSessions: CareerOverviewSession[];
  trend: CareerOverviewTrendPoint[];
  recommendation: {
    title: string;
    description: string;
    actionLabel: string;
  };
}
