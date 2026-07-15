import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aggregateCareerOverview } from "./careerOverviewAggregation";
import { CareerProjectDirectory } from "./CareerProjectDirectory";
import { buildCareerDirectoryProjects, filterCareerDirectoryProjects } from "./careerProjectDirectoryFilter";
import type { CareerProjectDefinition } from "./careerProjectDefinition";
import type {
  CareerProjectContribution,
  CareerProjectDataset,
  CareerProjectModule,
} from "./careerProjectModule";
import { CareerProjectRegistry } from "./careerProjectRegistry";
import { gridShotCareerModule } from "./projects/gridShot/gridShotCareerModule";
import type { GridShotCareerSession } from "../../game/career/gridShotCareer";
import { trainingCatalogEntries } from "../../game/trainingCatalog";

const fakeDefinition: CareerProjectDefinition = {
  id: "fake-project",
  engineId: "test",
  difficulty: "development",
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
    summary: "1 session",
    trend: "observing",
    coreMetrics: [],
  },
  updatedAt: "2026-07-15T10:00:00.000Z",
  totalSessions: 1,
  totalDurationMs: 30_000,
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
  insight: { eyebrow: "SYSTEM", title: "Fake insight", description: "Fake description" },
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
      summary: "Grid Shot summary",
      trend: "stable",
      coreMetrics: [
        { code: "accuracy", label: "平均准确率", value: "90.0%" },
      ],
    },
    updatedAt: "2026-07-15T09:00:00.000Z",
    totalSessions: 2,
    totalDurationMs: 120_000,
    activity: [
      { completedAt: "2026-07-15T09:00:00.000Z", durationMs: 60_000 },
      { completedAt: "2026-07-14T09:00:00.000Z", durationMs: 60_000 },
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
    insight: { eyebrow: "SYSTEM", title: "Grid insight", description: "Grid description" },
  };
}

describe("career project module architecture", () => {
  it("registers a second project and exposes its own profile renderer", () => {
    const registry = new CareerProjectRegistry([gridShotCareerModule, fakeModule]);
    const directory = renderToStaticMarkup(createElement(CareerProjectDirectory, {
      projects: aggregateCareerOverview([gridContribution(), fakeContribution]).projects,
      onOpenProject: () => undefined,
    }));

    expect(registry.listModules().map((module) => module.definition.id)).toEqual(["grid-shot", "fake-project"]);
    expect(gridShotCareerModule.trainingEntries.some((entry) => entry.id === "benchmark")).toBe(true);
    expect(gridShotCareerModule.definition.benchmark.configurationKey).toBe("grid-shot:60s:medium");
    expect(directory).toContain("测试项目");
    expect(directory).not.toContain("Browse core data from foundation to elite.");
    expect(renderToStaticMarkup(registry.getModule("fake-project")!.renderProfile({} as never))).toContain("FAKE PROJECT PROFILE");
  });

  it("searches registered projects without depending on a functional category", () => {
    const projects = aggregateCareerOverview([gridContribution(), fakeContribution]).projects;
    const directoryProjects = buildCareerDirectoryProjects(projects, []);

    expect(filterCareerDirectoryProjects(directoryProjects, "").map((project) => project.id)).toEqual(["grid-shot", "fake-project"]);
    expect(filterCareerDirectoryProjects(directoryProjects, "fake project").map((project) => project.id)).toEqual(["fake-project"]);
    expect(filterCareerDirectoryProjects(directoryProjects, "architecture").map((project) => project.id)).toEqual(["fake-project"]);
  });

  it("renders 31 registered projects as real directory cards without placeholder projects", () => {
    const projects = Array.from({ length: 31 }, (_, index) => ({
      ...fakeContribution.project,
      definition: {
        ...fakeContribution.project.definition,
        id: `fake-project-${index + 1}`,
        name: [`测试项目 ${index + 1}`, `FAKE PROJECT ${index + 1}`] as const,
      },
    }));
    const directory = renderToStaticMarkup(createElement(CareerProjectDirectory, {
      projects,
      onOpenProject: () => undefined,
      catalogEntries: [],
    }));

    expect(directory.match(/class="career-project-card"/g)).toHaveLength(31);
    expect(directory).not.toContain("02–31");
  });

  it("groups the 31 planned training projects by difficulty and marks 30 as pending", () => {
    const directory = renderToStaticMarkup(createElement(CareerProjectDirectory, {
      projects: aggregateCareerOverview([gridContribution()]).projects,
      onOpenProject: () => undefined,
      catalogEntries: trainingCatalogEntries,
    }));

    expect(directory.match(/class="career-project-card(?: is-pending)?"/g)).toHaveLength(31);
    expect(directory.match(/class="career-project-card is-pending"/g)).toHaveLength(30);
    expect(directory.match(/class="career-directory-group"/g)).toHaveLength(4);
    expect(directory.match(/class="career-project-core-data"/g)).toHaveLength(1);
    expect(directory).toContain("90.0%");
    expect(directory).toMatch(/career-directory-result-heading[\s\S]*career-directory-search/);
  });

  it("adapts project card metrics up to four cells and summarizes additional metrics", () => {
    const contribution = gridContribution();
    const project = {
      ...contribution.project,
      coreMetrics: Array.from({ length: 6 }, (_, index) => ({
        code: `metric-${index + 1}`,
        label: `Metric ${index + 1}`,
        value: `Value ${index + 1}`,
      })),
    };
    const directory = renderToStaticMarkup(createElement(CareerProjectDirectory, {
      projects: [project],
      onOpenProject: () => undefined,
      catalogEntries: [],
    }));

    expect(directory).toContain('data-count="4"');
    expect(directory).toContain("Value 4");
    expect(directory).not.toContain("Value 5");
    expect(directory).toContain("+2");
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
    expect(model.weeklySessions).toBe(3);
    expect(model.abilities.find((ability) => ability.code === "click-precision")?.value).toBe("91.0%");
    expect(aggregateCareerOverview([fakeContribution]).abilities[0].value).toBe("-");
  });

  it("keeps trend labels owned by the project contribution", () => {
    const contribution = {
      ...gridContribution(),
      trend: [
        { order: 1, completedAt: "2026-07-14T09:00:00.000Z", primary: 10, secondary: 20 },
        { order: 2, completedAt: "2026-07-15T09:00:00.000Z", primary: 12, secondary: 22 },
      ],
      trendLabels: { primary: "Project primary", secondary: "Project secondary" },
    };

    expect(aggregateCareerOverview([contribution]).trendLabels).toEqual(contribution.trendLabels);
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
