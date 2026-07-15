import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CareerGuestIntro } from "../../pages/CareerPage";
import { CareerGamePlan } from "./CareerGamePlan";

describe("CareerGamePlan", () => {
  it("stays an explicit placeholder until all training projects are complete", () => {
    const html = renderToStaticMarkup(<CareerGamePlan />);

    expect(html).toMatch(/待开发|Coming later/);
    expect(html).toMatch(/31 个训练项目|31 training projects/);
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
});
