import { ArrowLeft, Crosshair, RotateCcw, Timer, Zap } from "lucide-react";
import type { GridShotHistoryRecord } from "../game/types/training";
import { tx } from "../i18n";

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
        <h1>{tx("本次训练已经结束", "This training session has ended")}</h1>
        <button onClick={onTrainingHome}><ArrowLeft />{tx("返回训练首页", "Back to training")}</button>
      </main>
    );
  }

  return (
    <main className="result-page result-page-simple">
      <section className="result-complete-stage">
        <div className="result-complete-mark"><span /><Crosshair /></div>
        <h1>{tx("训练完成", "Training complete")}</h1>
        <p>{tx("本次成绩暂未保存。", "This result has not been saved.")}</p>

        <div className="result-session-score">
          <small>{tx("本局得分", "Session score")}</small>
          <strong>{record.score.toLocaleString()}</strong>
        </div>

        <div className="result-session-facts" aria-label={tx("本局基础记录", "Session summary")}>
          <span><Crosshair size={18} /><small>{tx("命中目标", "Targets hit")}</small><b>{record.hits}</b></span>
          <span><Zap size={18} /><small>{tx("准确率", "Accuracy")}</small><b>{record.accuracy.toFixed(1)}%</b></span>
          <span><Timer size={18} /><small>{tx("训练时长", "Duration")}</small><b>{record.duration} {tx("秒", "sec")}</b></span>
        </div>

        <div className="result-actions">
          <button className="primary" onClick={onAgain}><RotateCcw />{tx("再来一次", "Train again")}</button>
          <button onClick={onTrainingHome}><ArrowLeft />{tx("返回训练首页", "Back to training")}</button>
        </div>
      </section>
    </main>
  );
}
