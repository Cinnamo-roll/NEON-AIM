import { CalendarRange, Crosshair, Layers3, RefreshCw, UserRound } from "lucide-react";
import { tx } from "../../i18n";

const PLANNED_FEATURES = [
  {
    code: "01",
    icon: UserRound,
    title: ["游戏目标档案", "Game goal profile"],
    description: ["记录你的游戏、位置与阶段目标。", "Save your game, role, and current goals."],
  },
  {
    code: "02",
    icon: Crosshair,
    title: ["专属训练组合", "Personal training mix"],
    description: ["从训练项目中组合更适合你的练习。", "Combine training projects around your needs."],
  },
  {
    code: "03",
    icon: CalendarRange,
    title: ["阶段训练安排", "Phased schedule"],
    description: ["生成清晰的周期、频率与训练重点。", "Set clear cycles, frequency, and priorities."],
  },
  {
    code: "04",
    icon: RefreshCw,
    title: ["动态计划调整", "Adaptive updates"],
    description: ["根据长期表现持续调整后续计划。", "Update the plan as long-term performance changes."],
  },
] as const;

export function CareerGamePlan() {
  return (
    <main className="workspace-main career-game-plan">
      <header className="career-primary-header career-game-plan-header">
        <div className="career-primary-header-content">
          <h1>{tx("游戏成长计划", "Game growth plan")}</h1>
        </div>
      </header>

      <section className="career-game-plan-preview">
        <header className="career-game-plan-status">
          <span><Layers3 size={20} /></span>
          <div>
            <small>{tx("当前状态", "CURRENT STATUS")}</small>
            <h2>{tx("待开发", "Coming later")}</h2>
          </div>
          <p>{tx(
            "将在 31 个训练项目完成后开始建设。",
            "Development starts after all 31 training projects are complete.",
          )}</p>
        </header>

        <div className="career-game-plan-planned">
          <header>
            <small>{tx("预计开发内容", "PLANNED FEATURES")}</small>
            <h3>{tx("从训练数据到游戏目标", "From training data to game goals")}</h3>
          </header>
          <div>
            {PLANNED_FEATURES.map(({ code, icon: Icon, title, description }) => (
              <article key={code}>
                <span><Icon size={17} /></span>
                <small>{code}</small>
                <strong>{tx(title[0], title[1])}</strong>
                <p>{tx(description[0], description[1])}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
