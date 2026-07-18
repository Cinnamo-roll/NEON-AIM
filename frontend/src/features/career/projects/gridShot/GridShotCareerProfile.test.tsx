import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import { GridShotCareerProfile } from "./GridShotCareerProfile";

function session(index: number): GridShotCareerSession {
  const completedAt = new Date(Date.UTC(2026, 6, 16, 10, index)).toISOString();
  return {
    key: `session-${index}`,
    projectId: "grid-shot",
    trainingId: "grid-shot",
    source: "cloud",
    clientSessionId: `session-${index}`,
    completedAt,
    startedAt: completedAt,
    durationMs: 60_000,
    score: 20_000 + index * 500,
    hits: 170 + index,
    misses: 20,
    accuracy: 89,
    targetsPerMinute: 170 + index,
    averageHitInterval: 350,
    consistencyScore: 78,
    maxCombo: 34,
    grade: "B",
    integrityStatus: "VALID",
    modeVersion: 1,
    scoringVersion: 1,
    configurationKey: "grid-shot:60s:medium",
    sessionType: "benchmark",
  };
}

describe("GridShotCareerProfile AI analysis", () => {
  it("presents the AI module as a complete-history profile before training records", () => {
    const markup = renderToStaticMarkup(createElement(GridShotCareerProfile, {
      data: { sessions: [session(1), session(2), session(3)], profile: null, notice: null },
      loading: false,
      authenticated: true,
      onBack: () => undefined,
      onRefresh: () => undefined,
      onOpenSession: () => undefined,
      onBrowseTraining: () => undefined,
    }));

    expect(markup).toContain("Ai分析");
    expect(markup).not.toContain("3 局有效记录 · 1 种配置");
    expect(markup).toContain("从完整历史中提炼训练重点");
    expect(markup).toContain("长期表现、近期变化、优势、提升重点和下一步计划");
    expect(markup.indexOf("Ai分析")).toBeLessThan(markup.indexOf("<h2>训练记录</h2>"));
    expect(markup).not.toContain("同配置数据暂时不足");
    expect(markup).not.toContain("Token");
  });
});
