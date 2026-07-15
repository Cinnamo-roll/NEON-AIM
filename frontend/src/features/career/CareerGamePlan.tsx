import { Layers3 } from "lucide-react";
import { tx } from "../../i18n";

export function CareerGamePlan() {
  return (
    <main className="workspace-main career-game-plan">
      <header className="career-game-plan-header">
        <div>
          <h1>{tx("游戏成长计划", "Game growth plan")}</h1>
          <p>{tx(
            "该板块将在全部训练项目及其能力档案完成后开放，届时会基于完整训练数据生成游戏专项成长路线。",
            "This area will open after every training project and capability profile is complete, using the full training dataset to build game-specific growth paths.",
          )}</p>
        </div>
      </header>

      <section className="career-game-plan-empty">
        <div>
          <Layers3 size={24} />
          <span>
            <small>{tx("开发状态", "DEVELOPMENT STATUS")}</small>
            <h2>{tx("待开发", "Coming later")}</h2>
            <p>{tx(
              "当前阶段优先完成 31 个训练项目。游戏成长计划不会影响训练记录、项目档案、综合能力档案和单局分析的使用。",
              "The current priority is completing all 31 training projects. Training records, project profiles, capability profiles, and session analysis remain fully available without a game plan.",
            )}</p>
          </span>
        </div>
        <div className="career-game-plan-outline">
          <span><b>01</b>{tx("完成训练项目", "Complete training projects")}</span>
          <span><b>02</b>{tx("建立项目能力档案", "Build project capability profiles")}</span>
          <span><b>03</b>{tx("完善综合能力档案", "Complete the combined capability profile")}</span>
          <span><b>04</b>{tx("开放游戏成长计划", "Open game growth plans")}</span>
        </div>
      </section>
    </main>
  );
}
