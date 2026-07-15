import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aggregateCareerOverview } from "./careerOverviewAggregation";
import { CareerProjectDirectory } from "./CareerProjectDirectory";
import type { CareerProjectDefinition } from "./careerProjectDefinition";
import type {
  CareerProjectContribution,
  CareerProjectDataset,
  CareerProjectModule,
} from "./careerProjectModule";
import { CareerProjectRegistry } from "./careerProjectRegistry";
import { gridShotCareerModule } from "./projects/gridShot/gridShotCareerModule";
import type { GridShotCareerSession } from "../../game/career/gridShotCareer";

const fakeDefinition: CareerProjectDefinition = {
  id: "fake-project",
  engineId: "test",
  name: ["测试项目", "FAKE PROJECT"],
  eyebrow: ["测试", "TEST"],
  description: ["仅用于架构测试", "Architecture test only"],
  capabilities: [{ code: "click-precision", label: ["点击精准", "Click precision"], weight: 1 }],
  metrics: [{ code: "fake", label: ["测试指标", "Fake metric"], unit: "pts", direction: "higher-is-better" }],
  benchmark: { configurationKey: "fake:benchmark", minimumSamples: 1, stableSamples: 2 },
};

const fakeDataset: CareerProjectDataset = {
  sessions: [{
    key: "fake-session",
    projectId: "fake-project",
    trainingId: "fake-training",
    completedAt: "2026-07-15T10:00:00.000Z",
    durationMs: 30_000,
    sessionType: "practice",
  }],
  payload: null,
  notice: null,
};

const fakeContribution: CareerProjectContribution = {
  project: {
    definition: fakeDefinition,
    statusLabel: "观察中",
    sessionCount: 1,
    benchmarkCount: 0,
    summary: "1 session",
    trend: "observing",
  },
  updatedAt: "2026-07-15T10:00:00.000Z",
  totalSessions: 1,
  totalDurationMs: 30_000,
  benchmarkSessions: 0,
  practiceSessions: 1,
  activity: fakeDataset.sessions.map((session) => session),
  abilities: [{
    code: "click-precision",
    label: "点击精准",
    observed: false,
    value: "-",
    note: "数据不足",
    trend: "observing",
    confidence: 0,
  }],
  recentSessions: [{
    id: "fake-session",
    projectId: "fake-project",
    trainingId: "fake-training",
    projectName: "FAKE PROJECT",
    completedAt: "2026-07-15T10:00:00.000Z",
    durationMs: 30_000,
    sessionType: "practice",
    context: "Practice · 30s",
    primaryValue: "12",
    secondaryValue: "-",
    grade: "A",
  }],
  trend: [],
  goal: {
    eyebrow: "GOAL",
    title: "Fake goal",
    description: "Fake description",
    completed: 0,
    total: 1,
    projectId: "fake-project",
    entryId: "practice",
    actionLabel: "Start",
  },
  recommendation: { title: "Fake goal", description: "Fake description", actionLabel: "Start" },
};

const fakeModule: CareerProjectModule = {
  definition: fakeDefinition,
  trainingEntries: [{ id: "practice", label: ["练习", "Practice"] }],
  loadLocal: () => fakeDataset,
  loadRemote: async (local) => local,
  isBenchmarkSession: (session) => session.sessionType === "benchmark",
  buildContribution: () => fakeContribution,
  renderProfile: () => createElement("div", null, "FAKE PROJECT PROFILE"),
  prepareSessionReview: () => ({
    initialDetail: { ok: true },
    missingDetailMessage: "missing",
    remoteErrorMessage: "failed",
  }),
  renderSessionReview: () => createElement("div", null, "FAKE SESSION REVIEW"),
};

function gridContribution(): CareerProjectContribution {
  return {
    project: {
      definition: gridShotCareerModule.definition,
      statusLabel: "稳定档案",
      sessionCount: 2,
      benchmarkCount: 1,
      summary: "Grid Shot summary",
      trend: "stable",
    },
    updatedAt: "2026-07-15T09:00:00.000Z",
    totalSessions: 2,
    totalDurationMs: 120_000,
    benchmarkSessions: 1,
    practiceSessions: 1,
    activity: [
      { completedAt: "2026-07-15T09:00:00.000Z", durationMs: 60_000, sessionType: "benchmark" },
      { completedAt: "2026-07-14T09:00:00.000Z", durationMs: 60_000, sessionType: "practice" },
    ],
    abilities: gridShotCareerModule.definition.capabilities.map((capability) => ({
      code: capability.code,
      label: capability.label[1],
      observed: capability.code === "click-precision",
      value: capability.code === "click-precision" ? "91.0%" : "-",
      note: capability.code === "click-precision" ? "stable" : "insufficient",
      trend: capability.code === "click-precision" ? "stable" : "observing",
      confidence: capability.code === "click-precision" ? 1 : 0,
      ...(capability.code === "click-precision" ? { normalizedScore: 91 } : {}),
    })),
    recentSessions: [],
    trend: [],
    goal: {
      eyebrow: "GOAL",
      title: "Grid goal",
      description: "Grid description",
      completed: 1,
      total: 3,
      projectId: "grid-shot",
      entryId: "benchmark",
      actionLabel: "Start",
    },
    recommendation: { title: "Grid goal", description: "Grid description", actionLabel: "Start" },
  };
}

describe("career project module architecture", () => {
  it("registers a second project and exposes its own profile renderer", () => {
    const registry = new CareerProjectRegistry([gridShotCareerModule, fakeModule]);
    const directory = renderToStaticMarkup(createElement(CareerProjectDirectory, {
      projects: aggregateCareerOverview([gridContribution(), fakeContribution]).projects,
      onOpenProject: () => undefined,
      onBrowseTraining: () => undefined,
    }));

    expect(registry.listModules().map((module) => module.definition.id)).toEqual(["grid-shot", "fake-project"]);
    expect(directory).toContain("测试项目");
    expect(renderToStaticMarkup(registry.getModule("fake-project")!.renderProfile({} as never))).toContain("FAKE PROJECT PROFILE");
  });

  it("dispatches recent records to their owning project renderer", () => {
    const registry = new CareerProjectRegistry([gridShotCareerModule, fakeModule]);
    const session = fakeContribution.recentSessions[0];
    const module = registry.getModule(session.projectId);

    expect(module?.definition.id).toBe("fake-project");
    expect(renderToStaticMarkup(module!.renderSessionReview({} as never))).toContain("FAKE SESSION REVIEW");
  });

  it("aggregates sessions and duration across projects without treating missing evidence as zero", () => {
    const model = aggregateCareerOverview([gridContribution(), fakeContribution], Date.parse("2026-07-15T12:00:00.000Z"));

    expect(model.totalSessions).toBe(3);
    expect(model.totalDurationMs).toBe(150_000);
    expect(model.benchmarkSessions).toBe(1);
    expect(model.practiceSessions).toBe(2);
    expect(model.weeklySessions).toBe(3);
    expect(model.abilities.find((ability) => ability.code === "click-precision")?.value).toBe("91.0%");
    expect(aggregateCareerOverview([fakeContribution]).abilities[0].value).toBe("-");
  });

  it("does not route an unknown project to Grid Shot", () => {
    const registry = new CareerProjectRegistry([gridShotCareerModule, fakeModule]);
    expect(registry.getModule("unknown-project")).toBeUndefined();
  });

  it("keeps Grid Shot session review routed through its own renderer", () => {
    const session = {
      key: "local:grid-session",
      projectId: "grid-shot",
      trainingId: "grid-shot",
      source: "local",
      clientSessionId: "grid-session",
      completedAt: "2026-07-15T09:00:00.000Z",
      startedAt: "2026-07-15T08:59:00.000Z",
      durationMs: 60_000,
      sessionType: "benchmark",
    } as GridShotCareerSession;

    const review = renderToStaticMarkup(gridShotCareerModule.renderSessionReview({
      session,
      detail: null,
      loading: false,
      error: null,
      onBack: () => undefined,
    }));

    expect(review).toContain("GRID SHOT");
  });
});
