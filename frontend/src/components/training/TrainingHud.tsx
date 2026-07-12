import type { GridShotSessionStats } from "../../game/types/training";

type TrainingHudProps = {
  stats: GridShotSessionStats;
  remaining: number;
  personalBest?: number;
  fps?: number;
  frameTime?: number;
  showFps?: boolean;
};

export function TrainingHud({
  stats,
  remaining,
  personalBest = 0,
  fps = 0,
  frameTime = 0,
  showFps = true,
}: TrainingHudProps) {
  const pace = stats.personalBestDeltaPercent;
  return (
    <>
      <div className={`training-hud ${remaining <= 10 ? "final-ten" : ""}`} data-testid="grid-shot-hud">
        <section className="hud-left">
          <small>SCORE</small>
          <strong className="hud-score">{stats.score.toLocaleString()}</strong>
          <span className="hud-combo">COMBO <b>×{stats.combo}</b></span>
          <span className="hud-max">BEST ×{stats.maxCombo}</span>
        </section>
        <section className="hud-center">
          <div className="hud-time">
            <strong>00:{String(Math.ceil(remaining)).padStart(2, "0")}</strong>
            <small>GRID SHOT</small>
          </div>
          {personalBest > 0 && (
            <div className={`hud-pace ${pace >= 0 ? "pace-ahead" : "pace-behind"}`}>
              {pace >= 0 ? "+" : ""}{pace.toFixed(1)}% {pace >= 0 ? "AHEAD OF BEST" : "BEHIND BEST"}
            </div>
          )}
        </section>
        <section className="hud-right">
          <small>ACCURACY</small>
          <strong>{stats.accuracy.toFixed(1)}%</strong>
          <span>{stats.hits} / {stats.shots}</span>
          <span className="hud-tpm"><b>{stats.targetsPerMinute.toFixed(0)}</b> TPM</span>
        </section>
      </div>
      {showFps && <span className="hud-fps"><b>{Math.round(fps)}</b> FPS · {frameTime.toFixed(1)}ms</span>}
    </>
  );
}
