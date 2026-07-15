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

    expect(html).toMatch(/访客成绩未保存|Guest result not saved/);
    expect(html).toMatch(/登录并保存本局|Sign in and save this session/);
    expect(html).toMatch(/登录后才能计入生涯|sign in to add it to Career/);
    expect(html).toMatch(/登录后解锁 AI 单局分析|Sign in to unlock AI session analysis/);
    expect(html).toMatch(/登录并解锁 AI 分析|Sign in to unlock AI analysis/);
    expect(html).not.toMatch(/已计入生涯基线|added to your career baseline/);
  });

  it("allows an ordinary signed-in user to access AI analysis after the session is saved", () => {
    expect(canUseGridShotAiAnalysis("authenticated", "00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(canUseGridShotAiAnalysis("guest", "00000000-0000-0000-0000-000000000001")).toBe(false);
    expect(canUseGridShotAiAnalysis("authenticated")).toBe(false);
    expect(canUseGridShotAiAnalysis("authenticated", "00000000-0000-0000-0000-000000000001", true)).toBe(false);
  });
});
