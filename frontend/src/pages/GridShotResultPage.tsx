import { Activity, Award, Crosshair, Home, RotateCcw, Target, Zap } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyzeGridShotEvents } from "../game/modes/gridShot/gridShotAnalytics";
import { evaluateGridShotGrade } from "../game/modes/gridShot/gridShotGrade";
import { trainingAdvice } from "../game/scoring/gridShotCoach";
import { readHistory } from "../game/storage/trainingStorage";
import type { GridShotHistoryRecord } from "../game/types/training";

const pct = (value: number, baseline: number) => baseline ? (value - baseline) / baseline * 100 : 0;

export function GridShotResultPage({
  record,
  onAgain,
  onHome,
  onModes,
}: {
  record?: GridShotHistoryRecord;
  onAgain: () => void;
  onHome: () => void;
  onModes: () => void;
}) {
  const history = readHistory();
  const result = record ?? history[0];
  if (!result) return <main><button onClick={onHome}>返回主页</button></main>;

  const previous = history.find((item) => item.id !== result.id);
  const best = Math.max(...history.map((item) => item.score), result.score);
  const newRecord = result.score >= best;
  const intervals = (result.hitIntervals ?? []).map((interval, index) => ({ hit: index + 1, interval: Math.round(interval) }));
  const timeline = result.timeline ?? (result.scoreTimeline ?? []).map((point) => ({
    ...point,
    accuracy: result.accuracy,
    tpm: result.targetsPerMinute,
    combo: 0,
  }));
  const analytics = result.events?.length
    ? analyzeGridShotEvents(result.events, {
      sessionDurationMs: result.duration * 1000,
      activeDurationMs: result.duration * 1000,
    })
    : null;
  const grade = analytics?.grade ?? evaluateGridShotGrade({
    accuracy: result.accuracy,
    targetsPerMinute: result.targetsPerMinute,
    consistency: result.consistencyScore,
    maxCombo: result.maxCombo,
  });
  const phases = analytics?.phases ?? result.phases;
  const debugStats = import.meta.env.DEV && new URLSearchParams(location.search).get("debugStats") === "1";

  return (
    <main className="result-page">
      <section className={`result-stage ${newRecord ? "new-record" : ""}`}>
        <div className="result-rank">
          <small>PERFORMANCE GRADE</small>
          <strong>{grade.grade}</strong>
          <span>{newRecord ? "NEW PERSONAL RECORD" : "SESSION COMPLETE"}</span>
        </div>
        <div className="result-score">
          <small>FINAL SCORE</small>
          <h1>{result.score.toLocaleString()}</h1>
          <p>
            {result.score < best ? `距离个人最佳 ${Math.abs(pct(result.score, best)).toFixed(1)}%` : "刷新个人最佳"}
            {" · "}
            {previous ? `较上局 ${pct(result.score, previous.score) >= 0 ? "+" : ""}${pct(result.score, previous.score).toFixed(1)}%` : "首次记录"}
          </p>
        </div>
        <div className="result-primary-metrics">
          <span><Crosshair />准确率<b>{result.accuracy.toFixed(1)}%</b></span>
          <span><Target />TPM<b>{result.targetsPerMinute.toFixed(0)}</b></span>
          <span><Zap />最大 Combo<b>×{result.maxCombo}</b></span>
          <span><Award />经验值<b>+{Math.round(result.score / 8)}</b></span>
        </div>
      </section>

      <section className="result-grade-details" aria-label="评级明细">
        <div>
          <span>速度<b>{grade.subgrades.speed}</b></span>
          <span>准确率<b>{grade.subgrades.accuracy}</b></span>
          <span>稳定性<b>{grade.subgrades.consistency}</b></span>
          <span>连续控制<b>{grade.subgrades.control}</b></span>
        </div>
        <p>{grade.explanation}</p>
      </section>

      <section className="score-breakdown">
        <h2>得分构成</h2>
        <div>
          <span>基础命中分<b>{(result.baseScoreTotal ?? result.hits * 100).toLocaleString()}</b></span>
          <span>速度奖励<b>+{(result.speedBonusTotal ?? 0).toLocaleString()}</b></span>
          <span>Combo 奖励<b>+{(result.comboBonusTotal ?? 0).toLocaleString()}</b></span>
          <span>稳定奖励<b>+{(result.stabilityBonusTotal ?? 0).toLocaleString()}</b></span>
          <span className="total">总分<b>{result.score.toLocaleString()}</b></span>
        </div>
      </section>

      <section className="result-core">
        <h2>核心表现</h2>
        <div className="metric-ribbon">
          <span>命中 / Miss<b>{result.hits} / {result.misses}</b></span>
          <span>平均命中间隔<b>{Math.round(result.averageHitInterval || 0)} ms</b></span>
          <span>中位命中间隔<b>{Math.round(result.medianHitInterval || 0)} ms</b></span>
          <span>最快间隔<b>{Math.round(result.fastestHitInterval || 0)} ms</b></span>
          <span>稳定性<b>{result.consistencyScore ?? 0} / 100</b></span>
          <span>目标平均存活<b>{Math.round(result.averageTargetLifetime || 0)} ms</b></span>
        </div>
      </section>

      <section className="result-charts">
        <article>
          <h3>分数趋势</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeline}><XAxis dataKey="time" /><YAxis hide /><Tooltip /><Line dataKey="score" stroke="#69efff" strokeWidth={2} dot={false} /></LineChart>
          </ResponsiveContainer>
        </article>
        <article>
          <h3>命中间隔趋势</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={intervals}><XAxis dataKey="hit" /><YAxis hide /><Tooltip /><Line dataKey="interval" stroke="#f4b860" strokeWidth={2} dot={false} /></LineChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="phase-analysis">
        <h2>阶段分析</h2>
        {phases ? phases.map((phase) => (
          <article key={phase.id}>
            <strong>{phase.label}</strong>
            <span>阶段得分<b>{phase.score}</b></span>
            <span>基础 / 速度<b>{phase.baseScoreTotal} / +{phase.speedBonusTotal}</b></span>
            <span>Combo / 稳定<b>+{phase.comboBonusTotal} / +{phase.stabilityBonusTotal}</b></span>
            <span>命中 / Miss<b>{phase.hits} / {phase.misses}</b></span>
            <span>准确率<b>{phase.accuracy.toFixed(1)}%</b></span>
            <span>TPM<b>{phase.targetsPerMinute.toFixed(0)}</b></span>
          </article>
        )) : <p className="legacy-stats-warning">此旧记录没有原始事件日志，无法可靠还原阶段统计。</p>}
      </section>

      <section className="coach-card">
        <Activity />
        <div><small>NEON COACH</small><h3>下一局训练建议</h3><p>{trainingAdvice(result)}</p></div>
      </section>

      {debugStats && <StatsDebugPanel result={result} analytics={analytics} />}

      <div className="result-actions">
        <button className="primary" onClick={onAgain}><RotateCcw />再来一次</button>
        <button onClick={onModes}><Target />返回训练协议</button>
        <button onClick={onHome}><Home />返回主页</button>
      </div>
    </main>
  );
}

function StatsDebugPanel({
  result,
  analytics,
}: {
  result: GridShotHistoryRecord;
  analytics: ReturnType<typeof analyzeGridShotEvents> | null;
}) {
  const events = result.events ?? [];
  const hits = events.filter((event) => event.type === "hit").length;
  const misses = events.filter((event) => event.type === "miss").length;
  const phaseScore = analytics?.phases.reduce((sum, phase) => sum + phase.score, 0) ?? 0;
  const phaseHits = analytics?.phases.reduce((sum, phase) => sum + phase.hits, 0) ?? 0;
  const phaseMisses = analytics?.phases.reduce((sum, phase) => sum + phase.misses, 0) ?? 0;
  const integrityPassed = Boolean(analytics?.integrity.passed);
  const grade = analytics?.grade ?? evaluateGridShotGrade({
    accuracy: result.accuracy,
    targetsPerMinute: result.targetsPerMinute,
    consistency: result.consistencyScore,
    maxCombo: result.maxCombo,
  });
  return (
    <details className={`stats-debug-panel ${integrityPassed ? "pass" : "failed"}`} open data-testid="grid-shot-stats-debug">
      <summary>STAT INTEGRITY: {integrityPassed ? "PASS" : "FAILED"}</summary>
      <div>
        <code>raw events <b>{events.length}</b></code>
        <code>hit / miss <b>{hits} / {misses}</b></code>
        <code>event score <b>{analytics?.score ?? 0}</b></code>
        <code>base / speed <b>{analytics?.baseScoreTotal ?? 0} / {analytics?.speedBonusTotal ?? 0}</b></code>
        <code>combo / stability <b>{analytics?.comboBonusTotal ?? 0} / {analytics?.stabilityBonusTotal ?? 0}</b></code>
        <code>phase score <b>{phaseScore}</b></code>
        <code>phase hits / miss <b>{phaseHits} / {phaseMisses}</b></code>
        <code>subscores <b>{grade.subscores.accuracy} / {grade.subscores.speed} / {grade.subscores.consistency} / {grade.subscores.control}</b></code>
        <code>accuracy cap <b>{grade.accuracyCap}</b></code>
        <code>S gate <b>{grade.hardGates.S.passed ? "PASS" : grade.hardGates.S.failed.join(", ")}</b></code>
        <code>S+ gate <b>{grade.hardGates["S+"].passed ? "PASS" : grade.hardGates["S+"].failed.join(", ")}</b></code>
        <code>limited by <b>{grade.limitedBy.join(" | ") || "none"}</b></code>
      </div>
      {!analytics && <p>Raw event log is unavailable for this legacy record.</p>}
      {analytics && !analytics.integrity.passed && <ul>{analytics.integrity.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
    </details>
  );
}
