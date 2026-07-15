import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CareerProjectDefinition } from "./careerProjectDefinition";
import { CareerOverview } from "./CareerOverview";
import type { CareerOverviewModel } from "./careerOverviewModel";

const activeDefinition: CareerProjectDefinition = {
  id: "active-project",
  engineId: "test",
  difficulty: "foundation",
  name: ["活跃项目", "ACTIVE PROJECT"],
  eyebrow: ["项目", "PROJECT"],
  description: ["测试", "Test"],
  capabilities: [{ code: "click-precision", label: ["点击精准", "Click precision"], weight: 1 }],
  metrics: [{ code: "accuracy", label: ["准确率", "Accuracy"], unit: "%", direction: "higher-is-better" }],
  benchmark: { configurationKey: "active:benchmark", minimumSamples: 1, stableSamples: 2 },
};

const inactiveDefinition: CareerProjectDefinition = {
  ...activeDefinition,
  id: "inactive-project",
  name: ["无记录项目", "INACTIVE PROJECT"],
};

const model: CareerOverviewModel = {
  updatedAt: "2026-07-15T12:00:00.000Z",
  totalSessions: 3,
  totalDurationMs: 150_000,
  weeklySessions: 2,
  weeklyDurationMs: 90_000,
  insight: {
    eyebrow: "系统分析",
    title: "当前表现整体稳定",
    description: "继续积累可比记录。",
  },
  abilities: [
    { code: "click-precision", label: "点击精准", value: "91.0%", note: "数据充分", trend: "stable" },
    { code: "rhythm-control", label: "节奏控制", value: "-", note: "观察中 / 数据不足", trend: "observing" },
  ],
  projects: [
    {
      definition: activeDefinition,
      statusLabel: "稳定档案",
      sessionCount: 3,
      summary: "项目摘要",
      trend: "stable",
      coreMetrics: [{ code: "accuracy", label: "平均准确率", value: "91.0%" }],
    },
    {
      definition: inactiveDefinition,
      statusLabel: "观察中",
      sessionCount: 0,
      summary: "等待训练",
      trend: "observing",
      coreMetrics: [],
    },
  ],
  recentSessions: [{
    id: "session-1",
    projectId: "active-project",
    trainingId: "active-training",
    projectName: "ACTIVE PROJECT",
    completedAt: "2026-07-15T12:00:00.000Z",
    durationMs: 30_000,
    sessionType: "practice",
    context: "30s · medium",
    primaryValue: "12,000",
    secondaryValue: "91.0%",
    grade: "A",
  }],
  trend: [],
  trendLabels: { primary: "项目主指标", secondary: "项目辅助指标" },
};

describe("CareerOverview", () => {
  it("keeps only key metrics, recent history, and the future AI chat shell", () => {
    const html = renderToStaticMarkup(<CareerOverview
      model={model}
      loading={false}
      notice={null}
      onBrowseTraining={() => undefined}
      onOpenSession={() => undefined}
    />);

    expect(html).toContain("生涯总览");
    expect(html).not.toContain("CAREER OVERVIEW");
    expect(html).toContain("累计训练");
    expect(html).toContain("累计时长");
    expect(html).toContain("本周训练");
    expect(html).toContain("本周时长");
    expect(html).toContain("最近训练");
    expect(html).toContain("点击记录打开历史训练复盘");
    expect(html).toContain("AI 对话");
    expect(html).toContain("会员功能 · 未来开发");
    expect(html).toContain("我最近进步了吗？");
    expect(html).not.toContain("系统分析");
    expect(html).not.toContain("生涯分析");
    expect(html).not.toContain("综合能力档案");
    expect(html).not.toContain("近期训练变化");
    expect(html).not.toContain("训练项目");
    expect(html).not.toContain("无记录项目");
    expect(html).toContain("ACTIVE PROJECT");
    expect(html).not.toContain("游戏成长计划");
  });
});
