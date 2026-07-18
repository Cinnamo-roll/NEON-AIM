import { Activity, Crosshair, Target, Timer, Zap } from "lucide-react";
import type { TrainingSessionReviewModel } from "../../../features/trainingReview/trainingSessionReviewModel";
import { formatSeconds, tx } from "../../../i18n";
import type { GridShotHistoryRecord } from "../../types/training";
import type { GridShotAnalysisBundle } from "./gridShotAnalysisSnapshot";
import type { GridShotTargetSize } from "./gridShotConfig";
import { formatGridShotTargetSizeLabel } from "./gridShotConfigurationLabel";

const phaseNames: ReadonlyArray<readonly [string, string]> = [
  ["起步", "Opening"],
  ["中段", "Middle"],
  ["收尾", "Closing"],
];

function maxBy<T>(items: readonly T[], value: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => (
    !best || value(item) > value(best) ? item : best
  ), undefined);
}

function segmentRange(segment: { startMs: number; endMs: number } | undefined) {
  return segment
    ? `${formatSeconds(segment.startMs / 1_000)}–${formatSeconds(segment.endMs / 1_000)}`
    : "—";
}

export function buildGridShotSessionReviewModel(
  record: GridShotHistoryRecord,
  bundle: GridShotAnalysisBundle,
  targetSize: GridShotTargetSize,
): TrainingSessionReviewModel {
  const activeSegments = bundle.detailSegments.filter((segment) => segment.hits + segment.misses > 0);
  const bestSegment = maxBy(
    activeSegments.filter((segment) => segment.hits + segment.misses >= 3),
    (segment) => segment.accuracy,
  );
  const mostHitsSegment = maxBy(activeSegments, (segment) => segment.hits);
  const mostMissesSegment = maxBy(
    activeSegments.filter((segment) => segment.misses > 0),
    (segment) => segment.misses,
  );
  const chartData = bundle.detailSegments.map((segment) => ({
    interval: `${formatSeconds(segment.startMs / 1_000)}–${formatSeconds(segment.endMs / 1_000)}`,
    hits: segment.hits,
    misses: segment.misses,
    accuracy: segment.hits + segment.misses >= 3 ? Number(segment.accuracy.toFixed(1)) : null,
  }));
  const maxSegmentCount = Math.max(0, ...chartData.map((segment) => segment.hits + segment.misses));
  const countStep = maxSegmentCount <= 8 ? 2 : maxSegmentCount <= 25 ? 5 : 10;
  const countCeiling = Math.max(countStep, Math.ceil(maxSegmentCount / countStep) * countStep);
  const lastPhase = bundle.aiSnapshot.windows.at(-1);

  return {
    projectId: "grid-shot",
    projectLabel: "GRID SHOT",
    title: tx("本局复盘", "Session review"),
    kicker: `GRID SHOT · ${formatSeconds(record.duration)} · ${formatGridShotTargetSizeLabel(targetSize)}`,
    score: record.score,
    grade: record.grade,
    metrics: [
      {
        id: "accuracy",
        label: tx("准确率", "Accuracy"),
        value: `${record.accuracy.toFixed(1)}%`,
        detail: tx(`${record.hits} 命中 · ${record.misses} 失误`, `${record.hits} hits · ${record.misses} misses`),
        icon: Crosshair,
      },
      {
        id: "pace",
        label: tx("命中速度", "Hit pace"),
        value: record.targetsPerMinute.toFixed(1),
        detail: tx("次 / 分钟", "hits per minute"),
        icon: Zap,
      },
      {
        id: "interval",
        label: tx("平均命中间隔", "Average hit interval"),
        value: `${Math.round(record.averageHitInterval)}ms`,
        detail: tx("相邻两次命中", "between consecutive hits"),
        icon: Timer,
      },
      {
        id: "stability",
        label: tx("节奏稳定", "Rhythm stability"),
        value: record.consistencyScore.toFixed(0),
        detail: tx("满分 100", "out of 100"),
        icon: Activity,
      },
      {
        id: "streak",
        label: tx("最高连击", "Best streak"),
        value: `×${record.maxCombo}`,
        detail: tx("本局峰值", "session peak"),
        icon: Target,
      },
    ],
    highlights: [
      {
        id: "most-hits",
        label: tx("命中最密集", "Most hits"),
        context: segmentRange(mostHitsSegment),
        value: mostHitsSegment ? tx(`${mostHitsSegment.hits} 次`, `${mostHitsSegment.hits}`) : "—",
        color: "#55c1cf",
      },
      {
        id: "most-misses",
        label: tx("失误最集中", "Most misses"),
        context: mostMissesSegment ? segmentRange(mostMissesSegment) : tx("本局无失误", "No misses"),
        value: tx(`${mostMissesSegment?.misses ?? 0} 次`, `${mostMissesSegment?.misses ?? 0}`),
        color: "#e47f72",
      },
      {
        id: "best-accuracy",
        label: tx("准确率最高", "Best accuracy"),
        context: bestSegment ? segmentRange(bestSegment) : tx("暂无数据", "No data"),
        value: bestSegment ? `${bestSegment.accuracy.toFixed(1)}%` : "—",
        color: "#f0c77b",
      },
    ],
    chart: {
      ariaLabel: tx("各时间区间的命中、失误和准确率", "Hits, misses, and accuracy by time interval"),
      categoryKey: "interval",
      data: chartData,
      series: [
        { key: "hits", label: tx("命中次数 · 左轴", "Hits · left axis"), kind: "bar", axis: "primary", color: "#55c1cf" },
        { key: "misses", label: tx("失误次数 · 左轴", "Misses · left axis"), kind: "bar", axis: "primary", color: "#e47f72" },
        { key: "accuracy", label: tx("准确率 · 右轴", "Accuracy · right axis"), kind: "line", axis: "secondary", color: "#f0c77b", unit: "%" },
      ],
      axes: {
        primary: {
          domain: [0, countCeiling],
          ticks: Array.from({ length: countCeiling / countStep + 1 }, (_, index) => index * countStep),
          allowDecimals: false,
        },
        secondary: { domain: [0, 100], ticks: [0, 25, 50, 75, 100], unit: "%" },
      },
      minWidth: Math.max(420, chartData.length * 72),
    },
    scoreBreakdown: {
      label: tx("得分构成", "Score breakdown"),
      totalLabel: tx("合计", "Total"),
      total: record.score,
      parts: [
        { id: "base", label: tx("基础命中", "Base hits"), value: record.baseScoreTotal, color: "#55c1cf" },
        { id: "speed", label: tx("速度奖励", "Speed bonus"), value: record.speedBonusTotal, color: "#78b9ef" },
        { id: "combo", label: tx("连击奖励", "Combo bonus"), value: record.comboBonusTotal, color: "#a89ad8" },
        { id: "stability", label: tx("稳定奖励", "Stability bonus"), value: record.stabilityBonusTotal, color: "#75caa2" },
      ],
    },
    phases: {
      label: tx("阶段表现", "Phase performance"),
      headlineMetricLabel: tx("准确率", "Accuracy"),
      items: bundle.aiSnapshot.windows.map((phase, index) => {
        const attempts = phase.hits + phase.misses;
        const name = phaseNames[index] ?? [`阶段 ${index + 1}`, `Phase ${index + 1}`] as const;
        return {
          id: phase.label,
          indexLabel: String(index + 1).padStart(2, "0"),
          label: tx(...name),
          headlineValue: attempts >= 3 ? `${phase.accuracy.toFixed(1)}%` : "—",
          stats: [
            { label: tx("命中 / 失误", "Hits / misses"), value: `${phase.hits} / ${phase.misses}` },
            {
              label: tx("命中速度", "Hit pace"),
              value: attempts > 0 ? tx(`${phase.targetsPerMinute.toFixed(1)} 次/分`, `${phase.targetsPerMinute.toFixed(1)} /min`) : "—",
            },
          ],
        };
      }),
    },
    targetActualValues: {
      accuracy: record.accuracy,
      consistencyScore: record.consistencyScore,
      targetsPerMinute: record.targetsPerMinute,
      averageHitInterval: record.averageHitInterval,
      lastPhaseAccuracy: lastPhase && lastPhase.hits + lastPhase.misses >= 3 ? lastPhase.accuracy : undefined,
      integrity: bundle.aiSnapshot.integrity.passed ? 1 : 0,
    },
  };
}
