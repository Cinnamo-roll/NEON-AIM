import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { canUseGridShotAiAnalysis } from "../game/analysis/gridShotAiAccess";
import { createEmptyGridShotStats, createGridShotRecord } from "../game/scoring/gridShotSession";
import { GridShotResultPage } from "./GridShotResultPage";

describe("GridShotResultPage persistence state", () => {
  it("offers guest sign-in without claiming the result was saved", () => {
    const record = {
      ...createGridShotRecord(createEmptyGridShotStats("guest-result", 60), 60),
      sessionType: "benchmark" as const,
    };

    const html = renderToStaticMarkup(
      <GridShotResultPage
        record={record}
        saveStatus="login-required"
        onTrainingHome={() => undefined}
        onLoginToSave={() => undefined}
      />,
    );

    expect(html).toMatch(/登录即可保存数据|Sign in to save your data/);
    expect(html).toMatch(/前往登录|Go to sign in/);
    expect(html).not.toMatch(/登录后保存本局成绩|Sign in to save this session/);
    expect(html).not.toMatch(/登录后可加入生涯记录|sign in to add it to Career/);
    expect(html).toMatch(/等待用户登录|Waiting for sign-in/);
    expect(html).not.toMatch(/等待开始|Ready to start/);
    expect(html).not.toMatch(/分析状态|Analysis status/);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="result-summary-tab"');
    expect(html).toContain('id="result-ai-tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/系统分析|System analysis/);
    expect(html).toMatch(/AI 深度分析|AI deep analysis/);
    expect(html).toContain("result-insight-surface");
    expect(html).not.toContain("result-review-evidence");
    expect(html).toMatch(/本局发现|Session findings/);
    expect(html).not.toMatch(/待提升|Improvement area/);
    expect(html).toMatch(/建议|Suggestion/);
    expect(html).not.toMatch(/下一局唯一重点|The one focus for your next run/);
    expect(html).not.toMatch(/下一局先守住点击确认|Protect click confirmation/);
    expect(html).toMatch(/AI 对话|AI chat/);
    expect(html).toMatch(/待开发|Coming soon/);
    expect(html).not.toMatch(/已计入生涯基线|added to your career baseline/);
    expect(html).not.toContain("result-complete-mark");
    expect(html).not.toMatch(/<h1[^>]*>本局复盘<\/h1>|<h1[^>]*>Session review<\/h1>/);
    expect(html).toMatch(/data-session-type="benchmark">GRID SHOT<\/h1>/);
    expect(html).not.toMatch(/GRID SHOT · 60/);
    expect(html).toMatch(/基准训练|Benchmark training/);
  });

  it("keeps saved status quiet and shows the full configuration for free practice", () => {
    const record = {
      ...createGridShotRecord(createEmptyGridShotStats("saved-practice", 60), 60),
      sessionType: "practice" as const,
    };

    const html = renderToStaticMarkup(
      <GridShotResultPage
        record={record}
        saveStatus="saved-cloud"
        serverSessionId="00000000-0000-0000-0000-000000000001"
        onTrainingHome={() => undefined}
      />,
    );

    expect(html).toMatch(/data-session-type="practice">GRID SHOT<\/h1>/);
    expect(html).toMatch(/result-session-config">GRID SHOT · 60 秒 · 中目标|result-session-config">GRID SHOT · 60s · Medium targets/);
    expect(html).toMatch(/自定义训练|Custom training/);
    expect(html).not.toMatch(/已保存到生涯|Saved to career/);
    expect(html).not.toMatch(/本局尚未保存|This session is not saved/);
    expect(html).toContain("dateTime=");
  });

  it("allows an ordinary signed-in user to access AI analysis after the session is saved", () => {
    expect(canUseGridShotAiAnalysis("authenticated", "00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(canUseGridShotAiAnalysis("guest", "00000000-0000-0000-0000-000000000001")).toBe(false);
    expect(canUseGridShotAiAnalysis("authenticated")).toBe(false);
    expect(canUseGridShotAiAnalysis("authenticated", "00000000-0000-0000-0000-000000000001", true)).toBe(false);
  });
});
