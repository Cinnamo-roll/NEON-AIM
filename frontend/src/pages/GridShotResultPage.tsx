import { ArrowLeft, Crosshair, RotateCcw, Timer, Zap } from "lucide-react";
import type { GridShotHistoryRecord } from "../game/types/training";

export function GridShotResultPage({
  record,
  onAgain,
  onTrainingHome,
}: {
  record?: GridShotHistoryRecord;
  onAgain: () => void;
  onTrainingHome: () => void;
}) {
  if (!record) {
    return (
      <main className="result-page result-empty">
        <h1>本次训练已经结束</h1>
        <button onClick={onTrainingHome}><ArrowLeft />返回训练首页</button>
      </main>
    );
  }

  return (
    <main className="result-page result-page-simple">
      <section className="result-complete-stage">
        <div className="result-complete-mark"><span /><Crosshair /></div>
        <small>GRID SHOT · SESSION COMPLETE</small>
        <h1>训练完成</h1>
        <p>本局数据只保留在当前页面，离开后不会写入历史记录。</p>

        <div className="result-session-score">
          <small>本局得分</small>
          <strong>{record.score.toLocaleString()}</strong>
        </div>

        <div className="result-session-facts" aria-label="本局基础记录">
          <span><Crosshair size={18} /><small>命中目标</small><b>{record.hits}</b></span>
          <span><Zap size={18} /><small>准确率</small><b>{record.accuracy.toFixed(1)}%</b></span>
          <span><Timer size={18} /><small>训练时长</small><b>{record.duration} 秒</b></span>
        </div>

        <div className="result-actions">
          <button className="primary" onClick={onAgain}><RotateCcw />再来一次</button>
          <button onClick={onTrainingHome}><ArrowLeft />返回训练首页</button>
        </div>
      </section>
    </main>
  );
}
