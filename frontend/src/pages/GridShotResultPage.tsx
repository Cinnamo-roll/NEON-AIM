import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Crosshair,
  ListChecks,
  LoaderCircle,
  LogIn,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrainingAnalysisTarget } from "../game/analysis/trainingAnalysis";
import { canUseGridShotAiAnalysis } from "../game/analysis/gridShotAiAccess";
import {
  getTrainingAiAnalysis,
  triggerTrainingAiAnalysis,
  type TrainingAiJob,
} from "../game/analysis/trainingAiAnalysisService";
import { TrainingGoalProgressPanel } from "../components/training/TrainingGoalProgressPanel";
import { getTrainingCoachingTask, type TrainingCoachingTask } from "../game/analysis/trainingCoachingTaskService";
import { buildGridShotAnalysisBundle } from "../game/modes/gridShot/gridShotAnalysisSnapshot";
import {
  isGridShotBenchmarkSettings,
  type GridShotTargetSize,
} from "../game/modes/gridShot/gridShotConfig";
import { buildGridShotRuleAnalysis } from "../game/scoring/gridShotCoach";
import type { TrainingSessionSaveStatus } from "../game/storage/trainingSessionService";
import type { GridShotHistoryRecord } from "../game/types/training";
import { tx } from "../i18n";
import { useAuthStore } from "../features/auth/authStore";

const phaseNames = [
  ["起步", "Opening"],
  ["中段", "Middle"],
  ["收尾", "Closing"],
] as const;

const targetSizeLabels: Record<GridShotTargetSize, [string, string]> = {
  small: ["小目标", "Small targets"],
  medium: ["中目标", "Medium targets"],
  large: ["大目标", "Large targets"],
};

function targetValue(target: TrainingAnalysisTarget) {
  const prefix = target.operator === "AT_LEAST" ? "≥" : "≤";
  const value = Number.isInteger(target.value) ? target.value.toFixed(0) : target.value.toFixed(1);
  return `${prefix} ${value}${target.unit === "%" || target.unit === "ms" ? target.unit : ` ${target.unit}`}`;
}

function formatActualValue(value: number, unit: string) {
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(value)}ms`;
  if (unit === "TPM") return tx(`${value.toFixed(1)} 次/分`, `${value.toFixed(1)} /min`);
  if (unit === "分" || unit === "pts") return tx(`${Math.round(value)} 分`, `${Math.round(value)} pts`);
  if (unit === "通过" || unit === "pass") return value >= 1 ? tx("通过", "Passed") : tx("未通过", "Not passed");
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

export function GridShotResultPage({
  record,
  targetSize = "medium",
  saveStatus = "idle",
  serverSessionId,
  onTrainingHome,
  onOpenSettings,
  onLoginToSave,
  onRetrySave,
  backLabel,
}: {
  record?: GridShotHistoryRecord;
  targetSize?: GridShotTargetSize;
  saveStatus?: TrainingSessionSaveStatus;
  serverSessionId?: string;
  onAgain?: () => void;
  onTrainingHome: () => void;
  onOpenSettings?: () => void;
  onLoginToSave?: () => void;
  onRetrySave?: () => void;
  backLabel?: readonly [string, string];
}) {
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === "authenticated";
  const bundle = useMemo(
    () => record ? buildGridShotAnalysisBundle(record, { targetSize }) : undefined,
    [record, targetSize],
  );
  const coach = bundle ? buildGridShotRuleAnalysis(bundle.aiSnapshot) : undefined;
  const [aiJob, setAiJob] = useState<TrainingAiJob>();
  const [aiError, setAiError] = useState("");
  const [coachingTask, setCoachingTask] = useState<TrainingCoachingTask | null>(null);
  const resultSessionType = record?.sessionType ?? (record && isGridShotBenchmarkSettings({
    duration: record.duration,
    targetSize,
  }) ? "benchmark" : "practice");
  const benchmarkResult = resultSessionType === "benchmark";

  useEffect(() => {
    if (!isAuthenticated || !serverSessionId) return;
    let active = true;
    void getTrainingAiAnalysis(serverSessionId).then((job) => {
      if (!active) return;
      setAiJob(job);
    }).catch(() => {
      if (active) setAiError(tx("暂时无法读取 AI 分析状态", "Could not load AI analysis status"));
    });
    return () => { active = false; };
  }, [isAuthenticated, serverSessionId]);

  useEffect(() => {
    if (!isAdmin || !serverSessionId) {
      setCoachingTask(null);
      return;
    }
    let active = true;
    void getTrainingCoachingTask("grid-shot").then((task) => {
      if (active) setCoachingTask(task);
    }).catch(() => {
      if (active) setCoachingTask(null);
    });
    return () => { active = false; };
  }, [isAdmin, serverSessionId]);

  useEffect(() => {
    if (!isAuthenticated || !serverSessionId || aiJob?.status !== "PENDING") return;
    let active = true;
    const timer = window.setInterval(() => {
      void getTrainingAiAnalysis(serverSessionId).then((job) => {
        if (!active) return;
        setAiJob(job);
      }).catch(() => {
        if (active) setAiError(tx("AI 状态更新失败，请稍后重试", "AI status update failed; try again shortly"));
      });
    }, 1_200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [aiJob?.status, isAuthenticated, serverSessionId]);

  if (!record || !bundle || !coach) {
    return (
      <main className="result-page result-empty">
        <h1>{tx("本次训练已经结束", "This training session has ended")}</h1>
        <button onClick={onTrainingHome}><ArrowLeft />{tx("返回训练首页", "Back to training")}</button>
      </main>
    );
  }

  const aiAnalysis = aiJob?.status === "READY" && aiJob.analysis.source === "AI" ? aiJob.analysis : undefined;
  const aiPending = aiJob?.status === "PENDING";
  const comparisonSampleSize = aiJob?.comparisonSampleSize ?? 0;
  const aiConfidence = aiJob?.confidence ?? (comparisonSampleSize >= 5
    ? "ESTABLISHED"
    : comparisonSampleSize >= 2 ? "DEVELOPING" : "SINGLE_SESSION");
  const aiConfidenceLabel = aiConfidence === "ESTABLISHED"
    ? tx("较高可信度", "Higher confidence")
    : aiConfidence === "DEVELOPING"
      ? tx("初步趋势", "Early trend")
      : tx("单局观察", "Single-session view");
  const canGenerateAi = canUseGridShotAiAnalysis(authStatus, serverSessionId, aiPending);
  const coachingAttempt = coachingTask?.progress.attempts.find((attempt) => attempt.sessionId === serverSessionId) ?? null;
  const coachingCycleFinished = coachingTask?.status === "COMPLETED"
    && coachingTask.evaluation?.sessionId === serverSessionId
    ? coachingTask.evaluation
    : null;
  const coachingResult = coachingCycleFinished ?? coachingAttempt;
  const coachingAttemptNumber = coachingAttempt
    ? coachingTask?.progress.attempts.findIndex((attempt) => attempt.sessionId === coachingAttempt.sessionId) ?? -1
    : -1;
  const triggerAi = async () => {
    if (!isAuthenticated || !serverSessionId || aiPending) return;
    setAiError("");
    try {
      const job = await triggerTrainingAiAnalysis(serverSessionId);
      setAiJob(job);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : tx("AI 教练解读请求失败", "AI coaching request failed"));
    }
  };

  const saveCopy: Record<TrainingSessionSaveStatus, [string, string]> = {
    idle: ["本局成绩仅在当前页面可见", "This result is available only on the current page"],
    saving: ["正在保存本局数据…", "Saving this session…"],
    "saved-cloud": ["已保存到生涯", "Saved to career"],
    "login-required": ["访客成绩未保存，登录后可保留本局", "Guest result not saved; sign in to keep this session"],
    failed: ["云端保存失败；离开页面后本局不会保留", "Cloud save failed; this session will be lost after leaving the page"],
  };
  const sessionTypeCopy: readonly [string, string] = benchmarkResult
    ? saveStatus === "saved-cloud"
      ? ["基准训练 · 已计入生涯基线", "Benchmark · added to your career baseline"]
      : saveStatus === "login-required"
        ? ["基准训练 · 登录后才能计入生涯", "Benchmark · sign in to add it to Career"]
        : saveStatus === "saving"
          ? ["基准训练 · 正在保存", "Benchmark · saving"]
          : saveStatus === "failed"
            ? ["基准训练 · 尚未计入生涯", "Benchmark · not added to Career"]
            : ["基准训练", "Benchmark"]
    : saveStatus === "saved-cloud"
      ? ["自由练习 · 已保存到生涯", "Free practice · saved to Career"]
      : saveStatus === "login-required"
        ? ["自由练习 · 登录后可保留记录", "Free practice · sign in to keep this result"]
        : saveStatus === "saving"
          ? ["自由练习 · 正在保存", "Free practice · saving"]
          : saveStatus === "failed"
            ? ["自由练习 · 尚未保存", "Free practice · not saved"]
            : ["自由练习", "Free practice"];
  const scoreParts = [
    { label: tx("基础命中", "Base hits"), value: record.baseScoreTotal, tone: "base" },
    { label: tx("速度奖励", "Speed bonus"), value: record.speedBonusTotal, tone: "speed" },
    { label: tx("连击奖励", "Combo bonus"), value: record.comboBonusTotal, tone: "combo" },
    { label: tx("稳定奖励", "Stability bonus"), value: record.stabilityBonusTotal, tone: "stability" },
  ];
  const activeSegments = bundle.detailSegments.filter((segment) => segment.hits + segment.misses > 0);
  const qualifiedAccuracySegments = activeSegments.filter((segment) => segment.hits + segment.misses >= 3);
  const bestSegment = qualifiedAccuracySegments.reduce((best, segment) => segment.accuracy > best.accuracy ? segment : best, qualifiedAccuracySegments[0]);
  const mostHitsSegment = activeSegments.reduce((most, segment) => segment.hits > most.hits ? segment : most, activeSegments[0]);
  const segmentsWithMisses = activeSegments.filter((segment) => segment.misses > 0);
  const mostMissesSegment = segmentsWithMisses.reduce((most, segment) => segment.misses > most.misses ? segment : most, segmentsWithMisses[0]);
  const segmentChartData = bundle.detailSegments.map((segment) => ({
    interval: `${segment.startMs / 1_000}–${segment.endMs / 1_000}s`,
    hits: segment.hits,
    misses: segment.misses,
    accuracy: segment.hits + segment.misses >= 3 ? Number(segment.accuracy.toFixed(1)) : null,
  }));
  const maxSegmentCount = Math.max(0, ...segmentChartData.map((segment) => segment.hits + segment.misses));
  const countStep = maxSegmentCount <= 8 ? 2 : maxSegmentCount <= 25 ? 5 : 10;
  const countCeiling = Math.max(countStep, Math.ceil(maxSegmentCount / countStep) * countStep);
  const countTicks = Array.from({ length: countCeiling / countStep + 1 }, (_, index) => index * countStep);
  const lastPhase = bundle.aiSnapshot.windows.at(-1);
  const targetActualValues: Record<string, number | undefined> = {
    accuracy: record.accuracy,
    consistencyScore: record.consistencyScore,
    targetsPerMinute: record.targetsPerMinute,
    averageHitInterval: record.averageHitInterval,
    lastPhaseAccuracy: lastPhase && lastPhase.hits + lastPhase.misses >= 3 ? lastPhase.accuracy : undefined,
    integrity: bundle.aiSnapshot.integrity.passed ? 1 : 0,
  };
  const nextTargets = coach.nextAction.targets.map((target) => {
    const actual = targetActualValues[target.metric];
    const passed = actual === undefined
      ? undefined
      : target.operator === "AT_LEAST" ? actual >= target.value : actual <= target.value;
    return { target, actual, passed };
  });
  const phaseRows = bundle.aiSnapshot.windows.map((phase, index) => {
    const attempts = phase.hits + phase.misses;
    const hasAccuracySample = attempts >= 3;
    const name: readonly [string, string] = phaseNames[index] ?? [`阶段 ${index + 1}`, `Phase ${index + 1}`];
    return { phase, index, name, hasAccuracySample };
  });

  return (
    <main className="result-page result-page-detailed result-workbench result-workbench-v3 session-review-page" data-grade={record.grade}>
      <section className="result-command-deck result-workbench-deck session-review-shell">
        <nav className="result-review-topbar" aria-label={tx("复盘页面导航", "Review navigation")}>
          <button type="button" onClick={onTrainingHome}><ArrowLeft />{backLabel ? tx(...backLabel) : tx("返回训练列表", "Back to training list")}</button>
        </nav>
        <section className="result-scoreboard result-scoreboard-v3">
          <header className="result-workbench-hero">
            <div className="result-workbench-title">
              <span className="result-complete-mark" aria-hidden="true"><i /><Crosshair /></span>
              <div>
                <small>{tx(`GRID SHOT · ${record.duration} 秒 · ${tx(...targetSizeLabels[targetSize])}`, `GRID SHOT · ${record.duration}s · ${tx(...targetSizeLabels[targetSize])}`)}</small>
                <h1>{tx("本局复盘", "Session review")}</h1>
                <p className="result-save-status" data-state={saveStatus}>{tx(...saveCopy[saveStatus])}</p>
                {record && <span className="result-benchmark-status" data-session-type={resultSessionType}>{benchmarkResult ? <Target size={12} /> : <Settings2 size={12} />}{tx(...sessionTypeCopy)}</span>}
              </div>
            </div>
            <div className="result-workbench-score">
              <div><small>{tx("本局得分", "Session score")}</small><strong>{record.score.toLocaleString()}</strong></div>
              <span><small>{tx("评级", "Grade")}</small><b aria-label={tx(`评级 ${record.grade}`, `Grade ${record.grade}`)}>{record.grade}</b></span>
            </div>
          </header>
          {(saveStatus === "login-required" || saveStatus === "failed") && (
            <div className="result-save-gate" data-state={saveStatus}>
              <span>{saveStatus === "login-required" ? <LogIn /> : <RefreshCw />}</span>
              <div>
                <b>{saveStatus === "login-required" ? tx("登录后保存本局成绩", "Sign in to save this session") : tx("这局还没有保存到云端", "This session has not reached the cloud")}</b>
                <small>{saveStatus === "login-required"
                  ? tx("保存后会计入生涯记录，并可立即使用 AI 单局分析。", "Once saved, it will count toward Career and unlock AI session analysis.")
                  : tx("重试成功后会计入生涯记录，并恢复本局 AI 分析。", "After a successful retry, it will count toward Career and restore AI analysis.")}</small>
              </div>
              {saveStatus === "login-required" && onLoginToSave
                ? <button type="button" onClick={onLoginToSave}>{tx("登录并保存", "Sign in and save")}<LogIn /></button>
                : saveStatus === "failed" && onRetrySave
                  ? <button type="button" onClick={onRetrySave}>{tx("重试保存", "Retry save")}<RefreshCw /></button>
                  : null}
            </div>
          )}
          <div className="result-workbench-metrics" aria-label={tx("本局核心数据", "Core session data")}>
            <article><Crosshair /><div><small>{tx("准确率", "Accuracy")}</small><b>{record.accuracy.toFixed(1)}%</b><em>{tx(`${record.hits} 命中 · ${record.misses} 失误`, `${record.hits} hits · ${record.misses} misses`)}</em></div></article>
            <article><Zap /><div><small>{tx("命中速度", "Hit pace")}</small><b>{record.targetsPerMinute.toFixed(1)}</b><em>{tx("次 / 分钟", "hits per minute")}</em></div></article>
            <article><Timer /><div><small>{tx("平均命中间隔", "Average hit interval")}</small><b>{Math.round(record.averageHitInterval)}ms</b><em>{tx("相邻两次命中", "between consecutive hits")}</em></div></article>
            <article><Activity /><div><small>{tx("稳定度", "Rhythm stability")}</small><b>{record.consistencyScore.toFixed(0)}</b><em>{tx("满分 100", "out of 100")}</em></div></article>
            <article><Target /><div><small>{tx("最高连击", "Best streak")}</small><b>×{record.maxCombo}</b><em>{tx("本局峰值", "session peak")}</em></div></article>
          </div>
        </section>

        {benchmarkResult && coachingResult && coachingTask && <TrainingGoalProgressPanel
          status={coachingResult.status}
          eyebrow={coachingCycleFinished
            ? tx("本轮目标 · 训练结果", "Current goal · cycle result")
            : tx(`本轮目标 · 第 ${coachingAttemptNumber + 1}/${coachingTask.progress.maxAttempts} 局`, `Current goal · run ${coachingAttemptNumber + 1}/${coachingTask.progress.maxAttempts}`)}
          title={coachingCycleFinished
            ? coachingResult.status === "ACHIEVED" ? tx("已稳定达到目标", "Goal consistently achieved") : coachingResult.status === "PARTIAL" ? tx("部分目标已经达成", "Some goals achieved") : tx("本轮还没有达到目标", "Goal not achieved")
            : coachingResult.status === "ACHIEVED" ? tx("本局达标，再稳定一次", "Run passed; repeat it once") : coachingResult.status === "PARTIAL" ? tx("部分达标，继续保持重点", "Some goals passed; keep the focus") : tx("本局未达标，下一局继续调整", "Run missed; adjust next run")}
          targets={coachingResult.targets}
          progressTargets={coachingTask.progress.targets}
          requiredPasses={coachingTask.progress.requiredPasses}
        />}

        <section className="result-review-story">
          <div className="result-review-narrative">
            <header><small>{tx("本局总结", "Session summary")}</small></header>
            <h2>{coach.headline}</h2>
            <p>{coach.summary}</p>
            <div className="result-review-action">
              <Target />
              <div><b>{coach.nextAction.title}</b><p>{coach.nextAction.description}</p></div>
              <div>{nextTargets.map(({ target, actual, passed }) => <span key={target.metric} data-status={passed === undefined ? "unknown" : passed ? "passed" : "focus"}>
                <small>{target.label}{passed && <CheckCircle2 aria-label={tx("已达成", "Achieved")} />}</small>
                <b>{actual === undefined ? "—" : formatActualValue(actual, target.unit)}</b>
                <em>{tx("目标", "Target")} {targetValue(target)}</em>
              </span>)}</div>
            </div>
          </div>
          <div className="result-review-evidence">
            <header><ListChecks aria-label={tx("训练建议", "Training suggestions")} /></header>
            <div>
              {coach.findings.map((finding) => <article key={finding.code} data-severity={finding.severity}><div><h3>{finding.title}</h3><p>{finding.evidence}</p><footer><b>{tx("建议", "Suggestion")}</b>{finding.advice}</footer></div></article>)}
            </div>
          </div>
        </section>

        <section className="result-stats-canvas">
          <header className="result-stats-title">
            <div><small>{tx("数据统计", "Session data")}</small></div>
          </header>
          <div className="result-stats-main">
            <div className="result-rhythm-chart">
              <div className="result-rhythm-highlights">
                <span><small>{tx("命中最多", "Most hits")}</small><b>{mostHitsSegment ? `${mostHitsSegment.startMs / 1000}–${mostHitsSegment.endMs / 1000}s` : "—"}</b><em>{mostHitsSegment ? tx(`${mostHitsSegment.hits} 次`, `${mostHitsSegment.hits}`) : "—"}</em></span>
                <span><small>{tx("失误最多", "Most misses")}</small><b>{mostMissesSegment ? `${mostMissesSegment.startMs / 1000}–${mostMissesSegment.endMs / 1000}s` : tx("本局无失误", "No misses")}</b><em>{tx(`${mostMissesSegment?.misses ?? 0} 次`, `${mostMissesSegment?.misses ?? 0}`)}</em></span>
                <span><small>{tx("准确率最高", "Best accuracy")}</small><b>{bestSegment ? `${bestSegment.startMs / 1000}–${bestSegment.endMs / 1000}s` : tx("暂无数据", "No data")}</b><em>{bestSegment ? `${bestSegment.accuracy.toFixed(1)}%` : "—"}</em></span>
              </div>
              <div className="result-chart-legend"><span data-tone="hits"><i />{tx("命中次数 · 左轴", "Hits · left axis")}</span><span data-tone="misses"><i />{tx("失误次数 · 左轴", "Misses · left axis")}</span><span data-tone="accuracy"><i />{tx("准确率 · 右轴", "Accuracy · right axis")}</span></div>
              <div className="result-composed-chart-scroll">
                <div className="result-composed-chart" style={{ minWidth: `${Math.max(320, segmentChartData.length * 72)}px` }} aria-label={tx("各时间区间的命中、失误和准确率", "Hits, misses, and accuracy by time interval")}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart data={segmentChartData} margin={{ top: 14, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke="rgba(116, 163, 174, .08)" vertical={false} />
                      <XAxis dataKey="interval" interval={0} stroke="#60717b" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis yAxisId="count" domain={[0, countCeiling]} ticks={countTicks} allowDecimals={false} width={28} stroke="#60717b" tickLine={false} axisLine={false} fontSize={10} />
                      <YAxis yAxisId="accuracy" orientation="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={32} stroke="#60717b" tickLine={false} axisLine={false} fontSize={10} unit="%" />
                      <Tooltip contentStyle={{ background: "#071018", border: "1px solid rgba(105, 220, 231, .14)", borderRadius: 10, fontSize: 11 }} />
                      <Bar yAxisId="count" stackId="attempts" dataKey="hits" name={tx("命中次数", "Hits")} fill="rgba(101, 186, 198, .8)" maxBarSize={42} />
                      <Bar yAxisId="count" stackId="attempts" dataKey="misses" name={tx("失误次数", "Misses")} fill="rgba(213, 127, 118, .76)" maxBarSize={42} radius={[5, 5, 0, 0]} />
                      <Line yAxisId="accuracy" type="monotone" dataKey="accuracy" name={tx("准确率", "Accuracy")} unit="%" stroke="#b7a7d2" strokeWidth={2.2} dot={{ r: 3, fill: "#b7a7d2" }} activeDot={{ r: 5, fill: "#b7a7d2" }} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <aside className="result-score-distribution">
              <header><Zap /><span><small>{tx("得分构成", "Score breakdown")}</small></span></header>
              <div className="result-score-total"><small>{tx("合计", "Total")}</small><strong>{Math.round(record.score).toLocaleString()}</strong></div>
              <div className="result-score-stack" aria-label={tx("得分占比", "Score shares")}>{scoreParts.map((part) => { const share = record.score > 0 ? part.value / record.score * 100 : 0; return <i key={part.label} data-tone={part.tone} style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />; })}</div>
              <div className="result-score-legend">{scoreParts.map((part) => { const share = record.score > 0 ? part.value / record.score * 100 : 0; return <span key={part.label} data-tone={part.tone}><i /><small>{part.label}</small><b>{Math.round(part.value).toLocaleString()}</b><em>{share.toFixed(1)}%</em></span>; })}</div>
              <section className="result-phase-summary">
                <header><small>{tx("阶段表现", "Phase performance")}</small><em>{tx("准确率", "Accuracy")}</em></header>
                <div>
                  {phaseRows.map(({ phase, index, name, hasAccuracySample }) => <article key={phase.label}>
                    <header>
                      <span>0{index + 1}</span>
                      <b>{tx(name[0], name[1])}</b>
                      <strong>{hasAccuracySample ? `${phase.accuracy.toFixed(1)}%` : "—"}</strong>
                    </header>
                    <footer>
                      <span>{tx("命中 / 失误", "Hits / misses")} <b>{phase.hits} / {phase.misses}</b></span>
                      <span>{tx("命中速度", "Hit pace")} <b>{phase.hits + phase.misses > 0 ? tx(`${phase.targetsPerMinute.toFixed(1)} 次/分`, `${phase.targetsPerMinute.toFixed(1)} /min`) : "—"}</b></span>
                    </footer>
                  </article>)}
                </div>
              </section>
            </aside>
          </div>
        </section>

        <section className="result-ai-stage" data-state={!isAuthenticated ? "LOGIN_REQUIRED" : aiJob?.status ?? "NOT_REQUESTED"} data-expanded={Boolean(aiAnalysis)}>
          <header className="result-ai-stage-header">
            <div>{aiPending ? <LoaderCircle className="spin" /> : <BrainCircuit />}<span><small>{tx("AI 复盘", "AI review")}</small></span></div>
            {!isAuthenticated
              ? <em>{tx("登录后可用", "Sign-in required")}</em>
              : (aiAnalysis || aiJob?.status === "FAILED" || aiJob?.status === "BUDGET_EXHAUSTED") && <em>{aiAnalysis ? tx("已完成", "Ready") : tx("分析失败", "Unavailable")}</em>}
          </header>
          <div className="result-ai-stage-body">
            <div className="result-ai-stage-summary">
              {aiAnalysis && <div className="result-ai-confidence" data-level={aiConfidence}><b>{aiConfidenceLabel}</b></div>}
              <h2>{!isAuthenticated
                ? tx("登录后解锁 AI 单局分析", "Sign in to unlock AI session analysis")
                : aiAnalysis
                ? aiAnalysis.headline
                : aiPending
                  ? tx("正在整理你的训练建议", "Preparing your coaching notes")
                  : aiJob?.status === "FAILED" || aiJob?.status === "BUDGET_EXHAUSTED"
                    ? tx("这次分析没有完成", "The analysis could not be completed")
                    : tx("要不要让 AI 再看一遍这局？", "Want AI to take another look at this session?")}</h2>
              <p>{!isAuthenticated
                ? tx("AI 会结合本局表现和近期同配置记录，补充规则复盘没有覆盖的细节。登录并保存本局后即可使用。", "AI adds details beyond the rule review using this session and recent matching records. Sign in and save to use it.")
                : aiAnalysis
                ? aiAnalysis.summary
                : aiPending
                  ? tx("完成后会在这里直接给出结论和下一步练法。", "The conclusion and next step will appear here when ready.")
                  : aiJob?.failureMessage || aiError || (!serverSessionId
                      ? tx("本局保存完成后，AI 可以补充规则复盘没覆盖的细节。", "Once this session is saved, AI can add details not covered by the rule review.")
                      : tx("它会补充规则复盘没覆盖的细节，并参考最近 5 局同配置训练。", "It will add details not covered by the rule review and reference the five most recent matching sessions."))}</p>
              {aiAnalysis && <div className="result-ai-stage-focus"><Target /><span><small>{tx("建议你接下来", "Recommended next step")}</small><b>{aiAnalysis.nextAction.title}</b><p>{aiAnalysis.nextAction.description}</p></span></div>}
            </div>
            {aiAnalysis && <div className="result-ai-stage-insights">
              {aiAnalysis.findings.map((finding) => <article key={finding.code} data-severity={finding.severity}><div><b>{finding.title}</b><small>{finding.evidence}</small><p>{finding.advice}</p></div></article>)}
            </div>}
          </div>
          <footer className="result-ai-stage-footer">
            {aiAnalysis && <small>{aiJob?.cacheHit ? tx("已使用本局现有建议，没有新增消耗", "Reused the existing coaching note with no added usage") : tx(`${(aiJob?.inputTokens ?? 0) + (aiJob?.outputTokens ?? 0)} Token · ${aiJob?.model ?? "AI"}`, `${(aiJob?.inputTokens ?? 0) + (aiJob?.outputTokens ?? 0)} tokens · ${aiJob?.model ?? "AI"}`)}</small>}
            {!isAuthenticated
              ? <button type="button" disabled={!onLoginToSave} onClick={onLoginToSave}><LogIn />{tx("登录并解锁 AI 分析", "Sign in to unlock AI analysis")}</button>
              : <div className="result-ai-stage-actions">
                  {isAdmin && aiError && onOpenSettings && <button type="button" className="secondary" onClick={onOpenSettings}><Settings2 />{tx("检查 AI 配置", "Check AI settings")}</button>}
                  <button type="button" disabled={!canGenerateAi} onClick={() => void triggerAi()}>{aiPending ? <LoaderCircle className="spin" /> : <Sparkles />}{!serverSessionId ? tx("等待本局保存", "Waiting for save") : aiAnalysis ? tx("重新分析", "Analyze again") : tx("让 AI 分析这局", "Analyze this session")}</button>
                </div>}
          </footer>
        </section>

      </section>
    </main>
  );
}
