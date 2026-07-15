import { Activity } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TrainingSessionReviewModel } from "../../features/trainingReview/trainingSessionReviewModel";
import { TrainingSessionMetricGrid, TrainingSessionStatsCard } from "./TrainingSessionReviewData";

const fakeReviewModel: TrainingSessionReviewModel = {
  projectId: "tracking-test",
  projectLabel: "TRACKING TEST",
  title: "测试复盘",
  kicker: "TRACKING TEST · 30 秒",
  score: 812,
  grade: "A",
  metrics: [{
    id: "path-stability",
    label: "路径稳定性",
    value: "92.4%",
    detail: "测试项目自己的核心指标",
    icon: Activity,
  }],
  highlights: [{
    id: "lowest-deviation",
    label: "偏差最低",
    context: "10–15s",
    value: "3.2px",
    color: "#66cdaa",
  }],
  chart: {
    ariaLabel: "追踪偏差变化",
    categoryKey: "interval",
    data: [{ interval: "0–5s", deviation: 4.1 }],
    series: [{ key: "deviation", label: "追踪偏差 · 左轴", kind: "line", axis: "primary", color: "#66cdaa" }],
    axes: { primary: { domain: [0, 10], ticks: [0, 5, 10], unit: "px" } },
    minWidth: 420,
  },
  scoreBreakdown: {
    label: "质量构成",
    totalLabel: "合计",
    total: 812,
    parts: [{ id: "control", label: "控制质量", value: 812, color: "#66cdaa" }],
  },
  phases: {
    label: "区间表现",
    headlineMetricLabel: "稳定性",
    items: [{
      id: "phase-1",
      indexLabel: "01",
      label: "进入目标",
      headlineValue: "91.0%",
      stats: [{ label: "平均偏差", value: "4.1px" }],
    }],
  },
  targetActualValues: { pathStability: 92.4 },
};

describe("TrainingSessionReviewData", () => {
  it("renders project-provided metrics and statistics without Grid Shot field assumptions", () => {
    const html = renderToStaticMarkup(<>
      <TrainingSessionMetricGrid metrics={fakeReviewModel.metrics} />
      <TrainingSessionStatsCard model={fakeReviewModel} />
    </>);

    expect(html).toContain("路径稳定性");
    expect(html).toContain("追踪偏差变化");
    expect(html).toContain("控制质量");
    expect(html).toContain("平均偏差");
    expect(html).not.toContain("基础命中");
    expect(html).not.toContain("最高连击");
  });
});
