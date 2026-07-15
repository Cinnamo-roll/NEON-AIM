import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudOff,
  Crosshair,
  Gauge,
  Flag,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getTrainingCareerAiAnalysis,
  triggerTrainingCareerAiAnalysis,
  type TrainingCareerAiConfidence,
  type TrainingCareerAiJob,
} from "../../../../game/analysis/trainingCareerAiAnalysisService";
import {
  adoptTrainingCoachingTask,
  type TrainingCoachingTask,
} from "../../../../game/analysis/trainingCoachingTaskService";
import type { TrainingAnalysisTarget } from "../../../../game/analysis/trainingAnalysis";
import {
  isGridShotBenchmarkSession,
  summarizeGridShotCareer,
} from "../../../../game/career/gridShotCareer";
import {
  type TrainingCareerDimensionProfile,
  type TrainingCareerMetricProfile,
  type TrainingCareerProfileConfidence,
} from "../../../../game/career/trainingCareerProfileService";
import { GRID_SHOT_BENCHMARK } from "../../../../game/modes/gridShot/gridShotConfig";
import { getAppLanguage, tx } from "../../../../i18n";
import type { GridShotCareerProjectData } from "./gridShotCareerProjectData";
import "../../../../pages/careerPage.css";

interface GridShotCareerProfileProps {
  data: GridShotCareerProjectData;
  loading: boolean;
  authenticated: boolean;
  isAdmin: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionKey: string) => void;
  onStartTraining: (entryId: string) => void;
  onBrowseTraining: () => void;
}

type CareerScope = "benchmark" | "all";

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatNumber(value: number) {
  return number.format(Math.round(value));
}

function formatDate(value: string, withTime = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat(getAppLanguage(), {
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.round(durationMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} ${tx("分钟", "min")}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDelta(value: number | null, suffix = "%") {
  if (value === null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function confidenceLabel(confidence: TrainingCareerAiConfidence) {
  if (confidence === "STABLE") return tx("稳定结论", "Stable");
  if (confidence === "LOW") return tx("低置信度", "Low confidence");
  return tx("初步观察", "Initial observation");
}

function profileConfidenceLabel(confidence: TrainingCareerProfileConfidence) {
  if (confidence === "STABLE") return tx("稳定档案", "Stable profile");
  if (confidence === "DEVELOPING") return tx("成长档案", "Developing profile");
  if (confidence === "INITIAL") return tx("初步档案", "Initial profile");
  if (confidence === "OBSERVING") return tx("数据观察中", "Collecting data");
  return tx("等待基准记录", "Awaiting benchmark");
}

function abilityLabel(code: TrainingCareerDimensionProfile["code"]) {
  if (code === "CLICK_PRECISION") return tx("点击精准", "Click precision");
  if (code === "TARGET_SWITCHING") return tx("目标切换", "Target switching");
  if (code === "RHYTHM_STABILITY") return tx("节奏稳定", "Rhythm stability");
  return tx("持续控制", "Sustained control");
}

function formatCareerMetric(metric: TrainingCareerMetricProfile | undefined, value = metric?.current) {
  if (!metric || value === null || value === undefined) return "-";
  if (metric.unit === "%") return `${value.toFixed(1)}%`;
  if (metric.unit === "TPM") return `${value.toFixed(1)} TPM`;
  if (metric.unit === "ms") return `${Math.round(value)}ms`;
  if (metric.unit === "分") return `${Math.round(value)} / 100`;
  if (metric.unit === "百分点") return `${value >= 0 ? "+" : ""}${value.toFixed(1)} ${tx("个百分点", "pp")}`;
  return `${value.toFixed(1)} ${metric.unit}`;
}

function profileTrendText(metric: TrainingCareerMetricProfile | undefined) {
  if (!metric || metric.delta === null) return tx("完成 6 局后显示阶段变化", "Trend unlocks after six runs");
  const delta = `${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(metric.unit === "ms" ? 0 : 1)}${metric.unit === "%" ? tx(" 个百分点", " pp") : ` ${metric.unit}`}`;
  if (metric.trend === "IMPROVING") return tx(`近 3 局提升 ${delta}`, `Last three improved ${delta}`);
  if (metric.trend === "DECLINING") return tx(`近 3 局回落 ${delta}`, `Last three declined ${delta}`);
  return tx(`近 3 局基本稳定 ${delta}`, `Last three stable ${delta}`);
}

function targetValue(target: TrainingAnalysisTarget) {
  const prefix = target.operator === "AT_LEAST" ? "≥" : "≤";
  const value = Number.isInteger(target.value) ? target.value.toFixed(0) : target.value.toFixed(1);
  return `${prefix} ${value}${target.unit === "%" || target.unit === "ms" ? target.unit : ` ${target.unit}`}`;
}

function CareerMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="career-metric">
      <span><Icon size={17} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

export function GridShotCareerProfile({
  data,
  loading,
  authenticated,
  isAdmin,
  onBack,
  onRefresh,
  onOpenSession,
  onStartTraining,
  onBrowseTraining,
}: GridShotCareerProfileProps) {
  const sessions = data.sessions;
  const careerProfile = data.profile;
  const loadError = data.notice;
  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useState<CareerScope>("benchmark");
  const [careerAiJob, setCareerAiJob] = useState<TrainingCareerAiJob>();
  const [careerAiError, setCareerAiError] = useState("");
  const [coachingTask, setCoachingTask] = useState<TrainingCoachingTask | null>(data.coachingTask);
  const [coachingError, setCoachingError] = useState("");
  const [adoptingGoal, setAdoptingGoal] = useState(false);
  const authStatus = authenticated ? "authenticated" : "anonymous";
  const onStartBenchmark = () => onStartTraining("benchmark");

  useEffect(() => {
    setCoachingTask(data.coachingTask);
  }, [data.coachingTask]);

  const benchmarkSessions = useMemo(
    () => sessions.filter(isGridShotBenchmarkSession),
    [sessions],
  );
  const scopedSessions = scope === "benchmark" ? benchmarkSessions : sessions;
  const overview = useMemo(() => summarizeGridShotCareer(scopedSessions), [scopedSessions]);
  const benchmarkOverview = useMemo(
    () => summarizeGridShotCareer(benchmarkSessions),
    [benchmarkSessions],
  );
  const cloudBenchmarkValidSessions = benchmarkSessions.filter((session) => (
    session.source === "cloud" && session.integrityStatus === "VALID"
  )).length;
  const benchmarkNextMilestone = benchmarkOverview.validSessions < 3
    ? 3
    : benchmarkOverview.validSessions < 5
      ? 5
      : 10;
  const benchmarkRemaining = Math.max(0, benchmarkNextMilestone - benchmarkOverview.validSessions);

  useEffect(() => {
    if (authStatus !== "authenticated" || cloudBenchmarkValidSessions < 3) return;
    let active = true;
    void getTrainingCareerAiAnalysis("grid-shot").then((job) => {
      if (active) setCareerAiJob(job);
    }).catch(() => {
      if (active) setCareerAiError(tx("暂时无法读取综合分析状态", "Could not load career analysis status"));
    });
    return () => { active = false; };
  }, [authStatus, cloudBenchmarkValidSessions]);

  useEffect(() => {
    if (authStatus !== "authenticated" || careerAiJob?.status !== "PENDING") return;
    let active = true;
    const timer = window.setInterval(() => {
      void getTrainingCareerAiAnalysis("grid-shot").then((job) => {
        if (active) setCareerAiJob(job);
      }).catch(() => {
        if (active) setCareerAiError(tx("综合分析状态更新失败", "Career analysis status update failed"));
      });
    }, 1_200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authStatus, careerAiJob?.status]);

  const triggerCareerAi = async () => {
    if (authStatus !== "authenticated" || cloudBenchmarkValidSessions < 3
      || careerAiJob?.status === "PENDING") return;
    setCareerAiError("");
    try {
      setCareerAiJob(await triggerTrainingCareerAiAnalysis("grid-shot"));
    } catch (error) {
      setCareerAiError(error instanceof Error ? error.message : tx("AI 综合分析请求失败", "Career analysis request failed"));
    }
  };

  const startWithCareerGoal = async () => {
    const callId = careerAiJob?.callId;
    if (!callId || careerAiJob.status !== "READY" || !careerAiJob.analysis || adoptingGoal) return;
    if (coachingTask?.status === "ACTIVE" && coachingTask.sourceAnalysisCallId === callId) {
      onStartBenchmark();
      return;
    }
    setAdoptingGoal(true);
    setCoachingError("");
    try {
      const task = await adoptTrainingCoachingTask("grid-shot", callId);
      setCoachingTask(task);
      onStartBenchmark();
    } catch (error) {
      setCoachingError(error instanceof Error ? error.message : tx("训练目标启用失败", "Could not activate this training goal"));
    } finally {
      setAdoptingGoal(false);
    }
  };

  const activeCoachingTask = coachingTask?.status === "ACTIVE" ? coachingTask : null;
  const baselineGoal = benchmarkOverview.validSessions < 3
    ? { completed: benchmarkOverview.validSessions, total: 3, title: tx("建立第一份 Grid Shot 基线", "Establish your first Grid Shot baseline"), description: tx("完成三局固定配置训练，生涯才能开始判断趋势。", "Complete three fixed-configuration runs so career can begin judging trends.") }
    : benchmarkOverview.validSessions < 10
      ? { completed: benchmarkOverview.validSessions, total: benchmarkNextMilestone, title: tx("把初步档案练成稳定基线", "Turn the early profile into a stable baseline"), description: tx(`再完成 ${benchmarkRemaining} 局基准训练，提升档案可信度。`, `Complete ${benchmarkRemaining} more benchmark runs to improve profile confidence.`) }
      : { completed: 10, total: 10, title: tx("稳定基线已经建立", "Stable baseline established"), description: tx("继续训练以观察长期变化，或进入项目档案查看具体指标。", "Keep training to reveal long-term change, or open the project profile for detailed metrics.") };
  const overviewGoal = activeCoachingTask ? {
    eyebrow: tx("当前训练目标", "CURRENT TRAINING GOAL"),
    title: activeCoachingTask.title,
    description: activeCoachingTask.description,
    completed: activeCoachingTask.progress.attemptsCompleted,
    total: activeCoachingTask.progress.maxAttempts,
    actionLabel: tx("继续目标训练", "Continue goal"),
  } : {
    eyebrow: tx("当前训练目标", "CURRENT TRAINING GOAL"),
    ...baselineGoal,
    actionLabel: tx("开始基准训练", "Start benchmark"),
  };
  const visibleSessions = showAll ? scopedSessions : scopedSessions.slice(0, 12);

  return (
    <main className="workspace-main career-page career-home">
      <nav className="career-project-breadcrumb" aria-label={tx("生涯档案层级", "Career profile hierarchy")}>
        <button type="button" onClick={onBack}><ArrowLeft size={15} />{tx("训练项目", "Training projects")}</button>
        <ChevronRight size={14} />
        <span>GRID SHOT {tx("档案", "profile")}</span>
      </nav>
      <section className="career-hero">
        <div className="career-hero-copy">
          <span>GRID SHOT · {tx("生涯档案", "CAREER PROFILE")}</span>
          <h1>{tx("你的瞄准能力，正在形成清晰轨迹", "Your aim is becoming a clear progression")}</h1>
          <p>{tx("基准训练用于建立可比较的生涯基线；自由练习会保留记录，但不会干扰长期趋势。", "Benchmarks build a comparable career baseline. Free practice stays in history without affecting the long-term trend.")}</p>
          <div className="career-hero-actions">
            <button type="button" onClick={onStartBenchmark}><Play size={16} fill="currentColor" />{tx("开始基准训练", "Start benchmark")}</button>
            <button type="button" className="secondary" onClick={onBrowseTraining}>{tx("自由练习", "Free practice")}</button>
          </div>
        </div>
        <div className="career-personal-best">
          <small>{scope === "benchmark" ? tx("基准训练最佳效率", "Benchmark best pace") : tx("全部训练最佳效率", "All-session best pace")}</small>
          <strong>{overview.bestScorePerMinute ? formatNumber(overview.bestScorePerMinute) : "-"}</strong>
          <em>{tx("分 / 分钟", "pts / min")}</em>
          <span>{overview.validSessions ? `${overview.validSessions} ${tx("局有效记录", "valid sessions")}` : tx("等待第一局成绩", "Awaiting first session")}</span>
        </div>
      </section>

      <section className="career-benchmark-rail">
        <div className="career-benchmark-definition">
          <span><Target size={16} /></span>
          <div>
            <small>{tx("基准训练", "Benchmark")}</small>
            <b>{GRID_SHOT_BENCHMARK.duration}s · {tx("中型靶", "Medium targets")} · {GRID_SHOT_BENCHMARK.activeTargetCount} {tx("个同时目标", "active targets")}</b>
          </div>
        </div>
        <div className="career-benchmark-progress">
          <div>
            <strong>{benchmarkOverview.validSessions}<small>/10</small></strong>
            <p>{benchmarkOverview.validSessions >= 10
              ? tx("稳定基线已建立", "Stable baseline established")
              : tx(`再完成 ${benchmarkRemaining} 局，解锁${benchmarkNextMilestone === 3 ? "初步档案" : benchmarkNextMilestone === 5 ? "成长档案" : "稳定档案"}`, `${benchmarkRemaining} more to unlock the ${benchmarkNextMilestone === 3 ? "initial profile" : benchmarkNextMilestone === 5 ? "growth profile" : "stable profile"}`)}</p>
          </div>
          <span className="career-benchmark-track"><i style={{ width: `${Math.min(100, benchmarkOverview.validSessions * 10)}%` }} /></span>
          <div className="career-benchmark-milestones"><span className={benchmarkOverview.validSessions >= 3 ? "reached" : ""}>3 · {tx("初步档案", "Initial")}</span><span className={benchmarkOverview.validSessions >= 5 ? "reached" : ""}>5 · {tx("成长档案", "Growth")}</span><span className={benchmarkOverview.validSessions >= 10 ? "reached" : ""}>10 · {tx("稳定档案", "Stable")}</span></div>
        </div>
        <div className="career-scope-switch" role="group" aria-label={tx("生涯数据范围", "Career data scope")}>
          <button type="button" className={scope === "benchmark" ? "active" : ""} onClick={() => { setScope("benchmark"); setShowAll(false); }}>{tx("基准记录", "Benchmark")}<b>{benchmarkSessions.length}</b></button>
          <button type="button" className={scope === "all" ? "active" : ""} onClick={() => { setScope("all"); setShowAll(false); }}>{tx("全部记录", "All sessions")}<b>{sessions.length}</b></button>
        </div>
      </section>

      <section className="career-metric-grid">
        <CareerMetric icon={CalendarDays} label={tx("训练记录", "Sessions")} value={formatNumber(overview.totalSessions)} note={`${tx("累计时长", "Total time")} ${formatDuration(overview.totalDurationMs)}`} />
        <CareerMetric icon={Award} label={tx("平均效率", "Average pace")} value={overview.validSessions ? formatNumber(overview.averageScorePerMinute) : "-"} note={`${tx("分 / 分钟", "pts / min")} · ${tx("近 5 局", "last five")} ${formatDelta(overview.recentScoreDeltaPercent)}`} />
        <CareerMetric icon={Crosshair} label={tx("平均准确率", "Average accuracy")} value={overview.validSessions ? `${overview.averageAccuracy.toFixed(1)}%` : "-"} note={`${tx("近 5 局变化", "Last five")} ${formatDelta(overview.recentAccuracyDelta, tx(" 个百分点", " pp"))}`} />
        <CareerMetric icon={Gauge} label={tx("目标切换", "Target pace")} value={overview.validSessions ? overview.averageTargetsPerMinute.toFixed(1) : "-"} note={`TPM · ${tx("最高连击", "Best streak")} ×${overview.bestCombo}`} />
      </section>

      {benchmarkOverview.validSessions >= 3 && (
        <section className="career-data-panel career-ai-panel" data-state={careerAiJob?.status ?? "NOT_REQUESTED"}>
          <header>
            <div><BrainCircuit size={16} /><h2>{tx("AI 训练教练", "AI training coach")}</h2></div>
            <span>{confidenceLabel(careerAiJob?.confidence ?? (benchmarkOverview.validSessions >= 10 ? "STABLE" : benchmarkOverview.validSessions >= 5 ? "LOW" : "INITIAL"))}</span>
          </header>
          <div className="career-ai-body">
            <div className="career-ai-copy">
              {careerAiJob?.status === "PENDING" ? (
                <><h3>{tx("正在分析最近的训练表现", "Analyzing recent sessions")}</h3><p>{tx("只发送聚合指标和最多 6 局压缩切片，不上传逐次操作记录。", "Only aggregate metrics and up to six compact session slices are sent.")}</p></>
              ) : careerAiJob?.status === "READY" && careerAiJob.analysis ? (
                <>
                  <h3>{careerAiJob.analysis.headline}</h3>
                  <p>{careerAiJob.analysis.summary}</p>
                  <div className="career-ai-findings">
                    {careerAiJob.analysis.findings.map((finding) => (
                      <article key={finding.code}><b>{finding.title}</b><span>{finding.evidence}</span><p>{finding.advice}</p></article>
                    ))}
                  </div>
                  <div className="career-ai-next">
                    <div><small>{tx("下一阶段目标", "Next focus")}</small><b>{careerAiJob.analysis.nextAction.title}</b><p>{careerAiJob.analysis.nextAction.description}</p></div>
                    <div>{careerAiJob.analysis.nextAction.targets.map((target) => <span key={target.metric}><small>{target.label}</small><b>{targetValue(target)}</b></span>)}</div>
                  </div>
                  {isAdmin && <div className="career-ai-task-actions">
                    <div data-state={coachingTask?.status ?? "NONE"}>
                      {coachingTask?.status === "ACTIVE"
                        ? <><Flag size={14} /><span>{coachingTask.sourceAnalysisCallId === careerAiJob.callId
                          ? tx(`本轮目标 ${coachingTask.progress.attemptsCompleted}/${coachingTask.progress.maxAttempts} · 每项目标需通过 ${coachingTask.progress.requiredPasses} 次`, `Current goal ${coachingTask.progress.attemptsCompleted}/${coachingTask.progress.maxAttempts} · each target needs ${coachingTask.progress.requiredPasses} passes`)
                          : tx("已有一轮训练目标进行中", "Another training goal is active")}</span></>
                        : coachingTask?.status === "COMPLETED" && coachingTask.evaluation
                          ? <><CheckCircle2 size={14} /><span>{tx("上次目标", "Previous goal")} · {coachingTask.progress.attemptsCompleted} {tx("局", "runs")} · {coachingTask.evaluation.status === "ACHIEVED" ? tx("已达成", "achieved") : coachingTask.evaluation.status === "PARTIAL" ? tx("部分达成", "partially achieved") : tx("未达成", "not achieved")}</span></>
                          : <><Flag size={14} /><span>{tx("把建议变成下一局可验收目标", "Turn this advice into a measurable next run")}</span></>}
                    </div>
                    <button type="button" disabled={adoptingGoal} onClick={() => void startWithCareerGoal()}>
                      {adoptingGoal ? <LoaderCircle className="spin" size={15} /> : <Play size={15} fill="currentColor" />}
                      {coachingTask?.status === "ACTIVE" && coachingTask.sourceAnalysisCallId === careerAiJob.callId
                        ? tx(`继续第 ${coachingTask.progress.attemptsCompleted + 1} 局`, `Continue with run ${coachingTask.progress.attemptsCompleted + 1}`)
                        : tx("采用目标并开始", "Adopt goal and start")}
                    </button>
                  </div>}
                  {isAdmin && coachingTask?.status === "ACTIVE" && coachingTask.sourceAnalysisCallId === careerAiJob.callId && (
                    <div className="career-coaching-progress">
                      {coachingTask.progress.targets.map((target) => (
                        <span key={target.metric} data-achieved={target.achieved}>
                          <small>{target.label}</small>
                          <b>{target.passCount}/{target.requiredPasses} {tx("次通过", "passes")}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3>{benchmarkOverview.validSessions < 3
                    ? tx("先完成 3 局基准训练", "Complete three benchmark runs first")
                    : tx("生涯基线可以开始分析", "The benchmark is ready for analysis")}</h3>
                  <p>{benchmarkOverview.validSessions < 3
                    ? tx(`当前已有 ${benchmarkOverview.validSessions} 局基准记录，再完成 ${3 - benchmarkOverview.validSessions} 局即可生成初步综合分析。`, `${benchmarkOverview.validSessions} benchmark runs saved. Complete ${3 - benchmarkOverview.validSessions} more to unlock the initial analysis.`)
                    : tx(`${benchmarkOverview.validSessions} 局基准记录将用于本次分析，自由练习不会混入趋势。`, `${benchmarkOverview.validSessions} matching benchmark runs will be analyzed; free practice is excluded from the trend.`)}</p>
                </>
              )}
              {(careerAiError || (isAdmin && coachingError) || careerAiJob?.failureMessage) && <div className="career-ai-error"><ShieldAlert size={14} />{careerAiJob?.failureMessage || (isAdmin ? coachingError : "") || careerAiError}</div>}
              {careerAiJob?.status === "READY" && (
                <small className="career-ai-usage">{careerAiJob.cacheHit
                  ? tx("已命中数据缓存，本次未再次消耗 Token。", "Cached result; no additional tokens used.")
                  : tx(`本次使用 ${careerAiJob.inputTokens + careerAiJob.outputTokens} Token · ${careerAiJob.model}`, `${careerAiJob.inputTokens + careerAiJob.outputTokens} tokens · ${careerAiJob.model}`)}</small>
              )}
            </div>
            <button
              type="button"
              disabled={cloudBenchmarkValidSessions < 3 || careerAiJob?.status === "PENDING"}
              title={cloudBenchmarkValidSessions < 3 ? tx("至少需要 3 局已同步的基准记录", "At least three synced benchmark runs are required") : undefined}
              onClick={() => void triggerCareerAi()}
            >
              {careerAiJob?.status === "PENDING" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
              {cloudBenchmarkValidSessions < 3
                ? tx(`还需 ${3 - cloudBenchmarkValidSessions} 局`, `${3 - cloudBenchmarkValidSessions} more runs`)
                : careerAiJob?.status === "READY" && careerAiJob.stale
                  ? tx("按最新记录重新分析", "Analyze latest sessions")
                  : tx("生成综合分析", "Generate analysis")}
            </button>
          </div>
        </section>
      )}

      <section className="career-overview-grid">
        <section className="career-data-panel career-trend-panel">
          <header>
            <div><Activity size={16} /><h2>{tx("最近表现趋势", "Recent performance")}</h2></div>
            <span>{scope === "benchmark"
              ? tx("仅比较基准训练记录", "Benchmark runs only")
              : overview.configurationCount > 1
              ? tx(`混合 ${overview.configurationCount} 种配置，得分已按分钟归一`, `${overview.configurationCount} configurations · score normalized per minute`)
              : tx("最近 16 局有效记录", "Last 16 valid sessions")}</span>
          </header>
          {overview.trend.length > 1 ? (
            <div className="career-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.trend} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#17313a" vertical={false} />
                  <XAxis dataKey="order" stroke="#59717a" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis yAxisId="score" stroke="#59717a" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis yAxisId="accuracy" orientation="right" domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ background: "#07151c", border: "1px solid #294852", borderRadius: 8, fontSize: 11 }} />
                  <Line yAxisId="score" type="monotone" dataKey="scorePerMinute" name={tx("每分钟得分", "Score / min")} stroke="#65dfe7" strokeWidth={2.2} dot={{ r: 2, fill: "#65dfe7" }} activeDot={{ r: 4 }} />
                  <Line yAxisId="accuracy" type="monotone" dataKey="accuracy" name={tx("准确率", "Accuracy")} stroke="#9878e8" strokeWidth={1.6} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="career-chart-empty"><BarChart3 size={22} /><p>{tx("完成至少两局后显示趋势。", "Complete at least two sessions to show a trend.")}</p></div>
          )}
        </section>
        <section className="career-data-panel career-performance-panel">
          <header>
            <div><Target size={16} /><h2>{tx("Grid Shot 能力档案", "Grid Shot skill profile")}</h2></div>
            {careerProfile && <span>{careerProfile.sample.benchmarkSessions} {tx("局基准记录", "benchmark runs")} · {profileConfidenceLabel(careerProfile.sample.confidence)}</span>}
          </header>
          {careerProfile ? (
            <div className="career-ability-list">
              {careerProfile.dimensions.map((dimension) => {
                const primary = dimension.metrics.find((metric) => metric.code === dimension.primaryMetric);
                return (
                  <article key={dimension.code}>
                    <div><span>{abilityLabel(dimension.code)}</span><b>{formatCareerMetric(primary)}</b></div>
                    <small>{primary?.best === null || primary?.best === undefined
                      ? profileTrendText(primary)
                      : `${tx("历史最佳", "Best")} ${formatCareerMetric(primary, primary.best)} · ${profileTrendText(primary)}`}</small>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="career-baseline-list">
              <div><span>{tx("准确率", "Accuracy")}</span><b>{overview.validSessions ? `${overview.averageAccuracy.toFixed(1)}%` : "-"}</b><i style={{ width: `${Math.min(100, overview.averageAccuracy)}%` }} /></div>
              <div><span>{tx("击中速度", "Hit pace")}</span><b>{overview.validSessions ? `${overview.averageTargetsPerMinute.toFixed(1)} TPM` : "-"}</b><i style={{ width: `${Math.min(100, overview.averageTargetsPerMinute / 2.5)}%` }} /></div>
              <div><span>{tx("节奏稳定性", "Rhythm stability")}</span><b>{overview.validSessions ? `${overview.averageConsistencyScore.toFixed(0)} / 100` : "-"}</b><i style={{ width: `${Math.min(100, overview.averageConsistencyScore)}%` }} /></div>
            </div>
          )}
        </section>
      </section>

      <section className="career-data-panel career-project-analysis">
        <header>
          <div><BrainCircuit size={16} /><h2>{tx("综合分析", "Integrated analysis")}</h2></div>
          <span>{careerProfile ? profileConfidenceLabel(careerProfile.sample.confidence) : tx("等待基准数据", "Awaiting benchmark data")}</span>
        </header>
        <div className="career-project-analysis-body">
          <div><small>{tx("当前结论", "CURRENT FINDING")}</small><h3>{overviewGoal.title}</h3><p>{overviewGoal.description}</p></div>
          <div><small>{tx("数据来源", "DATA SOURCE")}</small><b>{tx("Grid Shot 训练记录", "Grid Shot training sessions")}</b><p>{tx("这里专注展示你在这个训练项目中的长期表现。", "This view focuses on your long-term performance in this training project.")}</p></div>
          <button type="button" onClick={onStartBenchmark}><Play size={15} fill="currentColor" />{overviewGoal.actionLabel}</button>
        </div>
      </section>

      <section className="career-data-panel career-history-panel">
        <header>
          <div><Clock3 size={16} /><h2>{scope === "benchmark" ? tx("基准训练记录", "Benchmark history") : tx("全部 Grid Shot 记录", "All Grid Shot history")}</h2></div>
          <div className="career-history-actions">
            {loading && <span><LoaderCircle className="spin" size={13} />{tx("同步中", "Syncing")}</span>}
            <button type="button" onClick={onRefresh} aria-label={tx("刷新记录", "Refresh history")}><RefreshCw size={14} /></button>
          </div>
        </header>
        {loadError && <div className="career-inline-notice"><CloudOff size={14} />{loadError}</div>}
        {scopedSessions.length ? (
          <>
            <div className="career-session-list">
              <div className="career-session-head"><span>{tx("时间", "Date")}</span><span>{tx("得分", "Score")}</span><span>{tx("准确率", "Accuracy")}</span><span>TPM</span><span>{tx("稳定性", "Stability")}</span><span>{tx("评级", "Grade")}</span><span /></div>
              {visibleSessions.map((session) => (
                <button type="button" className="career-session-row" data-integrity={session.integrityStatus.toLowerCase()} key={session.key} onClick={() => onOpenSession(session.key)}>
                  <span><time>{formatDate(session.completedAt)}</time><small>{isGridShotBenchmarkSession(session) ? `${tx("基准", "Benchmark")} · ` : `${tx("自由", "Practice")} · `}{Math.round(session.durationMs / 1_000)}s · {session.configurationKey.split(":").at(-1) ?? "-"} · {session.source === "cloud" ? tx("云端", "Cloud") : tx("本地", "Local")}</small></span>
                  <b>{formatNumber(session.score)}</b>
                  <span>{session.accuracy.toFixed(1)}%</span>
                  <span>{session.targetsPerMinute.toFixed(1)}</span>
                  <span>{Math.round(session.consistencyScore)}</span>
                  <em>{session.grade}</em>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            {scopedSessions.length > 12 && <button type="button" className="career-show-all" onClick={() => setShowAll((value) => !value)}>{showAll ? tx("收起记录", "Show less") : `${tx("查看全部", "Show all")} ${scopedSessions.length} ${tx("局", "sessions")}`}</button>}
          </>
        ) : !loading && (
          <div className="career-empty-state">
            <Crosshair size={28} />
            <h3>{scope === "benchmark" ? tx("还没有基准训练记录", "No benchmark runs yet") : tx("还没有 Grid Shot 记录", "No Grid Shot sessions yet")}</h3>
            <p>{scope === "benchmark" ? tx("完成一局基准训练，即可建立第一条生涯基线。", "Complete one benchmark run to start your baseline.") : tx("完成一局后，这里会自动生成生涯数据。", "Complete a session and your career data will appear here.")}</p>
            <button type="button" onClick={scope === "benchmark" ? onStartBenchmark : onBrowseTraining}>{scope === "benchmark" ? tx("开始基准训练", "Start benchmark") : tx("选择训练", "Choose training")}</button>
          </div>
        )}
      </section>
    </main>
  );
}
