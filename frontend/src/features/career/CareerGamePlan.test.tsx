import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingGuestTrainingSessions,
  stagePendingGuestTrainingSession,
} from "../../game/storage/pendingGuestTrainingSessions";
import { CareerGuestIntro } from "../../pages/CareerPage";
import { CareerGamePlan } from "./CareerGamePlan";

describe("CareerGamePlan", () => {
  beforeEach(() => clearPendingGuestTrainingSessions());

  it("stays an explicit placeholder until all training projects are complete", () => {
    const html = renderToStaticMarkup(<CareerGamePlan />);

    expect(html).toMatch(/待开发|Coming later/);
    expect(html).not.toContain("GAME GROWTH PLAN");
    expect(html).toMatch(/31 个训练项目|31 training projects/);
    expect(html).toMatch(/预计开发内容|PLANNED FEATURES/);
    expect(html).toMatch(/游戏目标档案|Game goal profile/);
    expect(html).toMatch(/动态计划调整|Adaptive updates/);
    expect(html.match(/<article/g)).toHaveLength(4);
    expect(html).not.toContain("GRID SHOT");
    expect(html).not.toContain("VALORANT");
    expect(html).not.toContain("<button");
  });

  it("explains Career to guests without rendering account data", () => {
    const html = renderToStaticMarkup(<CareerGuestIntro onLogin={() => undefined} />);

    expect(html).toMatch(/不只记录成绩，更告诉你下一步练什么|More than scores\. Know what to train next\./);
    expect(html).toMatch(/登录开启我的生涯|Sign in to start my Career/);
    expect(html).toMatch(/AI 会分析你的优势和短板|AI finds strengths and weak points/);
    expect(html).toMatch(/游戏训练计划|Game training plan/);
    expect(html).toMatch(/即将开放|Coming soon/);
    expect(html).not.toContain("GRID SHOT");
    expect(html).not.toContain("最近训练记录");
  });

  it("shows real in-memory guest sessions in the Career introduction", () => {
    stagePendingGuestTrainingSession({
      clientSessionId: "guest-grid-shot",
      trainingId: "grid-shot",
      modeVersion: 1,
      scoringVersion: 1,
      configurationKey: "grid-shot:60s:medium",
      sessionType: "benchmark",
      startedAt: "2026-07-15T08:00:00.000Z",
      completedAt: "2026-07-15T08:01:00.000Z",
      durationMs: 60_000,
      configuration: {},
      summary: {
        score: 23_950,
        hits: 186,
        misses: 43,
        accuracy: 81.2,
        targetsPerMinute: 186,
        averageHitInterval: 321,
        consistencyScore: 29,
        maxCombo: 17,
        grade: "B",
      },
      detail: {},
      analysisSnapshot: {},
      integrity: { passed: true, errors: [] },
    });

    const html = renderToStaticMarkup(<CareerGuestIntro onLogin={() => undefined} />);

    expect(html).toMatch(/本次访问训练|Training this visit/);
    expect(html).toContain("GRID SHOT");
    expect(html).toContain("23,950");
    expect(html).toContain("81.2%");
    expect(html).toMatch(/登录即可保存到生涯|Sign in to save to Career/);
  });

  it("renders every pending guest session so overflow remains scrollable", () => {
    for (let index = 1; index <= 5; index += 1) {
      stagePendingGuestTrainingSession({
        clientSessionId: `guest-session-${index}`,
        trainingId: "grid-shot",
        modeVersion: 1,
        scoringVersion: 1,
        configurationKey: "grid-shot:60s:medium",
        sessionType: index % 2 === 0 ? "practice" : "benchmark",
        startedAt: `2026-07-15T08:0${index}:00.000Z`,
        completedAt: `2026-07-15T08:0${index}:30.000Z`,
        durationMs: 30_000,
        configuration: {},
        summary: {
          score: index * 1_000,
          hits: index * 10,
          misses: index,
          accuracy: 90,
          targetsPerMinute: 120,
          averageHitInterval: 400,
          consistencyScore: 70,
          maxCombo: index * 2,
          grade: "B",
        },
        detail: {},
        analysisSnapshot: {},
        integrity: { passed: true, errors: [] },
      });
    }

    const html = renderToStaticMarkup(<CareerGuestIntro onLogin={() => undefined} />);

    expect(html).toMatch(/待保存 5 局|5 awaiting save/);
    expect(html.match(/<article/g)).toHaveLength(5);
    expect(html).toContain("5,000");
    expect(html).toContain("1,000");
  });
});
