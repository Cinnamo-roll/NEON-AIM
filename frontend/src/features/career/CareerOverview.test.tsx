import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CareerProjectDefinition } from "./careerProjectDefinition";
import { CareerOverview } from "./CareerOverview";
import type { CareerOverviewModel } from "./careerOverviewModel";
import { CAREER_OVERVIEW_PAGE_SIZE, getCareerOverviewPaginationItems } from "./careerOverviewPagination";

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
    context: "30 秒 · 中目标",
    primaryLabel: "得分",
    primaryValue: "12,000",
    secondaryLabel: "准确率",
    secondaryValue: "91.0%",
    grade: "A",
  }],
  trend: [],
  trendLabels: { primary: "项目主指标", secondary: "项目辅助指标" },
};

describe("CareerOverview", () => {
  it("prioritizes core metrics and recent session analysis links", () => {
    const html = renderToStaticMarkup(<CareerOverview
      model={model}
      loading={false}
      notice={null}
      onBrowseTraining={() => undefined}
      onOpenSession={() => undefined}
      onRetry={() => undefined}
    />);

    expect(html).toContain("生涯总览");
    expect(html).toContain("career-primary-header");
    expect(html).not.toContain("CAREER OVERVIEW");
    expect(html).toContain("累计训练");
    expect(html).toContain("累计时长");
    expect(html).toContain("近 7 天训练");
    expect(html).toContain("近 7 天时长");
    expect(html).toContain("最近训练");
    expect(html).not.toContain("选择一条训练记录，查看对应的单局分析");
    expect(html).toContain("得分");
    expect(html).toContain("准确率");
    expect(html).not.toContain(">单局分析<");
    expect(html).not.toContain("最近更新");
    expect(html).not.toContain("AI 对话");
    expect(html).not.toContain("系统分析");
    expect(html).not.toContain("生涯分析");
    expect(html).not.toContain("综合能力档案");
    expect(html).not.toContain("近期训练变化");
    expect(html).not.toContain("训练项目");
    expect(html).not.toContain("无记录项目");
    expect(html).toContain("ACTIVE PROJECT");
    expect(html).not.toContain("medium");
    expect(html).not.toContain("游戏成长计划");
    expect(html).not.toContain("最近 1 局");
  });

  it("paginates the last seven days without showing a latest-session count", () => {
    const recentSessions = Array.from({ length: CAREER_OVERVIEW_PAGE_SIZE + 1 }, (_, index) => ({
      ...model.recentSessions[0],
      id: `session-${index + 1}`,
      primaryValue: `score-${index + 1}`,
    }));
    const html = renderToStaticMarkup(<CareerOverview
      model={{ ...model, recentSessions }}
      loading={false}
      notice={null}
      onBrowseTraining={() => undefined}
      onOpenSession={() => undefined}
      onRetry={() => undefined}
    />);

    expect(html).toContain('aria-current="page"');
    expect(html).toContain("第 2 页");
    expect(html).toContain(`score-${CAREER_OVERVIEW_PAGE_SIZE}`);
    expect(html).not.toContain(`score-${CAREER_OVERVIEW_PAGE_SIZE + 1}`);
    expect(html).not.toContain("第 1 / 2 页");
    expect(html).not.toContain("最近 5 局");
  });

  it("keeps distant pages directly addressable without overflowing the paginator", () => {
    expect(getCareerOverviewPaginationItems(5, 12)).toEqual([
      0,
      "start-ellipsis",
      4,
      5,
      6,
      "end-ellipsis",
      11,
    ]);
    expect(getCareerOverviewPaginationItems(1, 3)).toEqual([0, 1, 2]);
  });

  it("explains loading and retryable failures without hiding saved data", () => {
    const loadingHtml = renderToStaticMarkup(<CareerOverview
      model={model}
      loading
      notice={null}
      onBrowseTraining={() => undefined}
      onOpenSession={() => undefined}
      onRetry={() => undefined}
    />);
    const errorHtml = renderToStaticMarkup(<CareerOverview
      model={{ ...model, totalSessions: 0, recentSessions: [] }}
      loading={false}
      notice="网络连接失败"
      onBrowseTraining={() => undefined}
      onOpenSession={() => undefined}
      onRetry={() => undefined}
    />);

    expect(loadingHtml).toContain("正在同步生涯数据");
    expect(loadingHtml).toContain("当前已保存的数据仍可正常查看");
    expect(errorHtml).toContain("生涯数据加载失败");
    expect(errorHtml).toContain("网络连接失败");
    expect(errorHtml).toContain("重新加载");
  });
});
