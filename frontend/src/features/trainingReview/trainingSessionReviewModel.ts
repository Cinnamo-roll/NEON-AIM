import type { LucideIcon } from "lucide-react";

export type TrainingReviewAxis = "primary" | "secondary";
export type TrainingReviewSeriesKind = "bar" | "line";

export interface TrainingReviewMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}

export interface TrainingReviewHighlight {
  id: string;
  label: string;
  context: string;
  value: string;
  color: string;
}

export interface TrainingReviewChartSeries {
  key: string;
  label: string;
  kind: TrainingReviewSeriesKind;
  axis: TrainingReviewAxis;
  color: string;
  unit?: string;
}

export type TrainingReviewChartDatum = Record<string, string | number | null>;

export interface TrainingReviewChart {
  ariaLabel: string;
  categoryKey: string;
  data: TrainingReviewChartDatum[];
  series: TrainingReviewChartSeries[];
  axes: {
    primary: TrainingReviewChartAxis;
    secondary?: TrainingReviewChartAxis;
  };
  minWidth: number;
}

export interface TrainingReviewChartAxis {
  domain: readonly [number, number];
  ticks: number[];
  unit?: string;
  allowDecimals?: boolean;
}

export interface TrainingReviewScorePart {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface TrainingReviewPhaseStat {
  label: string;
  value: string;
}

export interface TrainingReviewPhase {
  id: string;
  indexLabel: string;
  label: string;
  headlineValue: string;
  stats: TrainingReviewPhaseStat[];
}

export interface TrainingSessionReviewModel {
  projectId: string;
  projectLabel: string;
  title: string;
  kicker: string;
  score: number;
  grade: string;
  metrics: TrainingReviewMetric[];
  highlights: TrainingReviewHighlight[];
  chart: TrainingReviewChart;
  scoreBreakdown: {
    label: string;
    totalLabel: string;
    total: number;
    parts: TrainingReviewScorePart[];
  };
  phases: {
    label: string;
    headlineMetricLabel: string;
    items: TrainingReviewPhase[];
  };
  targetActualValues: Record<string, number | undefined>;
}
