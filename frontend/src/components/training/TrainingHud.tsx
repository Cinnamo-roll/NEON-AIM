import type { GridShotSessionStats } from "../../game/types/training";
import { tx } from "../../i18n";

type TrainingHudProps = {
  stats: GridShotSessionStats;
  remaining: number;
  fps?: number;
  frameTime?: number;
  showFps?: boolean;
};

export function TrainingHud({
  stats,
  remaining,
  fps = 0,
  frameTime = 0,
  showFps = true,
}: TrainingHudProps) {
  const displayedSecond = Math.ceil(remaining);
  const isFinalThree = displayedSecond <= 3;
  return (
    <>
      <div className={`training-hud ${remaining <= 10 ? "final-ten" : ""} ${isFinalThree ? "final-three" : ""}`} data-testid="grid-shot-hud">
        <section className="hud-left">
          <small>{tx("得分", "Score")}</small>
          <strong className="hud-score">{stats.score.toLocaleString()}</strong>
          <span className="hud-combo">{tx("连击", "Combo")} <b>×{stats.combo}</b></span>
          <span className="hud-max">{tx("最高", "Best")} ×{stats.maxCombo}</span>
        </section>
        <section className="hud-center">
          <div className="hud-time">
            <strong key={isFinalThree ? displayedSecond : "timer"}>00:{String(displayedSecond).padStart(2, "0")}</strong>
            <small>{isFinalThree ? tx("最后冲刺", "FINAL PUSH") : "GRID SHOT"}</small>
          </div>
        </section>
        <section className="hud-right">
          <small>{tx("准确率", "Accuracy")}</small>
          <strong>{stats.accuracy.toFixed(1)}%</strong>
          <span>{stats.hits} / {stats.shots}</span>
          <span className="hud-tpm"><b>{stats.targetsPerMinute.toFixed(0)}</b> TPM</span>
        </section>
      </div>
      {showFps && <span className="hud-fps"><b>{Math.round(fps)}</b> FPS · {frameTime.toFixed(1)}ms</span>}
    </>
  );
}
