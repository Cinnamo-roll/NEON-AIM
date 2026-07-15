import { tx } from "../../i18n";
import type { CareerProjectContribution } from "./careerProjectModule";
import type {
  CareerOverviewAbility,
  CareerOverviewInsight,
  CareerOverviewModel,
  CareerTrendDirection,
} from "./careerOverviewModel";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

function time(value: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateTrend(trends: CareerTrendDirection[]): CareerTrendDirection {
  const meaningful = trends.filter((trend) => trend !== "observing");
  if (!meaningful.length) return "observing";
  return meaningful.every((trend) => trend === meaningful[0]) ? meaningful[0] : "observing";
}

function aggregateAbilities(contributions: readonly CareerProjectContribution[]): CareerOverviewAbility[] {
  const byCode = new Map<string, Array<{
    evidence: CareerProjectContribution["abilities"][number];
    projectWeight: number;
  }>>();
  contributions.forEach((contribution) => {
    contribution.project.definition.capabilities.forEach((capability) => {
      const evidence = contribution.abilities.find((candidate) => candidate.code === capability.code);
      if (!evidence) return;
      const existing = byCode.get(capability.code) ?? [];
      existing.push({ evidence, projectWeight: capability.weight });
      byCode.set(capability.code, existing);
    });
  });
  return [...byCode.values()].map((entries) => {
    const observed = entries.filter(({ evidence }) => evidence.observed);
    const fallback = entries[0].evidence;
    if (!observed.length) {
      return {
        code: fallback.code,
        label: fallback.label,
        value: "-",
        note: tx("观察中 / 数据不足", "Observing / insufficient data"),
        trend: "observing",
      };
    }
    if (observed.length === 1) {
      const evidence = observed[0].evidence;
      return {
        code: evidence.code,
        label: evidence.label,
        value: evidence.value,
        note: evidence.note,
        trend: evidence.trend,
      };
    }
    const standardized = observed.filter(({ evidence }) => Number.isFinite(evidence.normalizedScore));
    if (standardized.length !== observed.length) {
      const strongest = [...observed].sort((left, right) => right.evidence.confidence - left.evidence.confidence)[0].evidence;
      return {
        code: strongest.code,
        label: strongest.label,
        value: strongest.value,
        note: tx(`${observed.length} 个项目提供非统一量纲证据`, `${observed.length} projects provide non-standardized evidence`),
        trend: aggregateTrend(observed.map(({ evidence }) => evidence.trend)),
      };
    }
    const weighted = standardized.map(({ evidence, projectWeight }) => ({
      value: evidence.normalizedScore ?? 0,
      weight: Math.max(0, projectWeight) * Math.max(0, evidence.confidence),
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const value = totalWeight > 0
      ? weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
      : null;
    return {
      code: fallback.code,
      label: fallback.label,
      value: value === null ? "-" : `${value.toFixed(0)} / 100`,
      note: value === null
        ? tx("观察中 / 数据不足", "Observing / insufficient data")
        : tx(`${standardized.length} 个项目 · 按贡献与可信度聚合`, `${standardized.length} projects · weighted by contribution and confidence`),
      trend: value === null ? "observing" : aggregateTrend(standardized.map(({ evidence }) => evidence.trend)),
    };
  });
}

function defaultInsight(): CareerOverviewInsight {
  return {
    eyebrow: tx("系统分析", "SYSTEM ANALYSIS"),
    title: tx("等待第一局训练数据", "Waiting for the first session"),
    description: tx("完成训练后，这里会根据有效记录总结当前表现。", "Complete a session to receive a summary based on valid records."),
  };
}

export function aggregateCareerOverview(
  contributions: readonly CareerProjectContribution[],
  now = Date.now(),
): CareerOverviewModel {
  const weeklyCutoff = now - WEEK_MS;
  const allActivity = contributions.flatMap((contribution) => contribution.activity);
  const weeklySessions = allActivity.filter((session) => time(session.completedAt) >= weeklyCutoff);
  const updatedAt = contributions.map((contribution) => contribution.updatedAt)
    .sort((left, right) => time(right) - time(left))[0] ?? null;
  const insightContribution = contributions
    .filter((contribution) => contribution.totalSessions > 0)
    .sort((left, right) => time(right.updatedAt) - time(left.updatedAt))[0] ?? contributions[0];
  const projectsWithTrend = contributions.filter((contribution) => contribution.trend.length > 0);
  const trendContribution = projectsWithTrend.length === 1 ? projectsWithTrend[0] : undefined;
  return {
    updatedAt,
    totalSessions: contributions.reduce((sum, contribution) => sum + contribution.totalSessions, 0),
    totalDurationMs: contributions.reduce((sum, contribution) => sum + contribution.totalDurationMs, 0),
    weeklySessions: weeklySessions.length,
    weeklyDurationMs: weeklySessions.reduce((sum, session) => sum + session.durationMs, 0),
    insight: insightContribution?.insight ?? defaultInsight(),
    abilities: aggregateAbilities(contributions),
    projects: contributions.map((contribution) => contribution.project),
    recentSessions: contributions.flatMap((contribution) => contribution.recentSessions)
      .sort((left, right) => time(right.completedAt) - time(left.completedAt)).slice(0, 8),
    trend: trendContribution?.trend ?? [],
    trendLabels: trendContribution?.trendLabels ?? {
      primary: tx("主要指标", "Primary metric"),
      secondary: tx("辅助指标", "Secondary metric"),
    },
  };
}
