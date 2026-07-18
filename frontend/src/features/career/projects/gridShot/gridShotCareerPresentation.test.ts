import { describe, expect, it } from "vitest";
import type { GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import {
  buildGridShotSequenceTicks,
  buildGridShotScoreTrend,
  calculateGridShotTargetsPerMinute,
  filterGridShotSessionsByRange,
  listGridShotPracticeConfigurations,
  summarizeGridShotAbility,
  summarizeGridShotPresentation,
} from "./gridShotCareerPresentation";

const session = (
  key: string,
  completedAt: string,
  overrides: Partial<GridShotCareerSession> = {},
): GridShotCareerSession => ({
  key,
  projectId: "grid-shot",
  trainingId: "grid-shot",
  source: "cloud",
  clientSessionId: key,
  completedAt,
  startedAt: completedAt,
  durationMs: 60_000,
  score: 10_000,
  hits: 100,
  misses: 10,
  accuracy: 90,
  targetsPerMinute: 100,
  averageHitInterval: 600,
  consistencyScore: 80,
  maxCombo: 25,
  grade: "B",
  integrityStatus: "VALID",
  modeVersion: 1,
  scoringVersion: 1,
  configurationKey: "grid-shot:60s:small",
  sessionType: "practice",
  ...overrides,
});

describe("gridShotCareerPresentation", () => {
  it("filters time ranges without mixing the all-data view", () => {
    const now = new Date("2026-07-16T00:00:00Z").getTime();
    const sessions = [
      session("recent", "2026-07-12T00:00:00Z"),
      session("older", "2026-06-01T00:00:00Z"),
    ];
    expect(filterGridShotSessionsByRange(sessions, "7d", now).map((item) => item.key)).toEqual(["recent"]);
    expect(filterGridShotSessionsByRange(sessions, "all", now)).toHaveLength(2);
  });

  it("orders raw session scores chronologically without adding derived trend lines", () => {
    const trend = buildGridShotScoreTrend([
      session("later", "2026-07-02T00:00:00Z", { score: 2_000 }),
      session("earlier", "2026-07-01T00:00:00Z", { score: 1_000 }),
    ]);
    expect(trend).toEqual([
      { key: "earlier", completedAt: "2026-07-01T00:00:00Z", score: 1_000 },
      { key: "later", completedAt: "2026-07-02T00:00:00Z", score: 2_000 },
    ]);
  });

  it("uses every session for small sets and round milestones for larger sets", () => {
    expect(buildGridShotSequenceTicks(3)).toEqual([1, 2, 3]);
    expect(buildGridShotSequenceTicks(12)).toEqual([1, 5, 10, 12]);
    expect(buildGridShotSequenceTicks(100)).toEqual([1, 20, 40, 60, 80, 100]);
  });

  it("derives TPM from hits and duration instead of trusting a cached value", () => {
    expect(calculateGridShotTargetsPerMinute(session("pace", "2026-07-16T00:00:00Z", {
      durationMs: 30_000,
      hits: 85,
      targetsPerMinute: 999,
    }))).toBe(170);
  });

  it("summarizes objective trend and ability values", () => {
    const sessions = [
      session("one", "2026-07-15T00:00:00Z"),
      session("two", "2026-07-16T00:00:00Z", {
        score: 20_000,
        hits: 150,
        misses: 30,
        accuracy: 80,
        targetsPerMinute: 150,
        maxCombo: 45,
      }),
    ];
    expect(summarizeGridShotPresentation(sessions)).toEqual({
      sessionCount: 2,
      averageScore: 15_000,
      bestScore: 20_000,
    });
    expect(summarizeGridShotAbility(sessions)).toEqual({
      hitPace: { average: 125, minimum: 100, maximum: 150 },
      accuracy: { average: 85, minimum: 80, maximum: 90 },
      maxCombo: { average: 35, minimum: 25, maximum: 45 },
      missesPerMinute: { average: 20, minimum: 10, maximum: 30 },
    });
  });

  it("lists practice configurations by most recent use", () => {
    const sessions = [
      session("small", "2026-07-15T00:00:00Z"),
      session("large", "2026-07-16T00:00:00Z", { configurationKey: "grid-shot:90s:large" }),
    ];
    expect(listGridShotPracticeConfigurations(sessions).map((item) => item.key)).toEqual([
      "grid-shot:90s:large",
      "grid-shot:60s:small",
    ]);
  });
});
