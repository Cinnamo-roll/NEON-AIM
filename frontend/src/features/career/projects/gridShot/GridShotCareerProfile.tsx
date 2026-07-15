import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  Clock3,
  CloudOff,
  Crosshair,
  Gauge,
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
import type { TrainingAnalysisTarget } from "../../../../game/analysis/trainingAnalysis";
import { summarizeGridShotCareer } from "../../../../game/career/gridShotCareer";
import {
  type TrainingCareerDimensionProfile,
  type TrainingCareerMetricProfile,
  type TrainingCareerProfileConfidence,
} from "../../../../game/career/trainingCareerProfileService";
import { getAppLanguage, tx } from "../../../../i18n";
import type { GridShotCareerProjectData } from "./gridShotCareerProjectData";
import "../../../../pages/careerPage.css";

interface GridShotCareerProfileProps {
  data: GridShotCareerProjectData;
  loading: boolean;
  authenticated: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionKey: string) => void;
  onBrowseTraining: () => void;
}

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
  return tx("等待有效记录", "Awaiting valid sessions");
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
  onBack,
  onRefresh,
  onOpenSession,
  onBrowseTraining,
}: GridShotCareerProfileProps) {
  const sessions = data.sessions;
  const careerProfile = data.profile;
  const loadError = data.notice;
  const [showAll, setShowAll] = useState(false);
  const [careerAiJob, setCareerAiJob] = useState<TrainingCareerAiJob>();
  const [careerAiError, setCareerAiError] = useState("");
  const authStatus = authenticated ? "authenticated" : "anonymous";
  const overview = useMemo(() => summarizeGridShotCareer(sessions), [sessions]);
  const comparable = useMemo(() => {
    if (!careerProfile?.cohort) return [];
    return sessions.filter((session) => session.integrityStatus === "VALID"
      && session.configurationKey === careerProfile.cohort?.configurationKey
      && session.modeVersion === careerProfile.cohort?.modeVersion
      && session.scoringVersion === careerProfile.cohort?.scoringVersion);
  }, [careerProfile?.cohort, sessions]);
  const trendOverview = useMemo(() => summarizeGridShotCareer(comparable), [comparable]);
  const comparableValidSessions = careerProfile?.sample.comparableSessions ?? 0;

  useEffect(() => {
    if (authStatus !== "authenticated" || comparableValidSessions < 3) return;
    let active = true;
    void getTrainingCareerAiAnalysis("grid-shot").then((job) => {
      if (active) setCareerAiJob(job);
    }).catch(() => {
      if (active) setCareerAiError(tx("暂时无法读取综合分析状态", "Could not load career analysis status"));
    });
    return () => { active = false; };
  }, [authStatus, comparableValidSessions]);

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
    if (authStatus !== "authenticated" || comparableValidSessions < 3
      || careerAiJob?.status === "PENDING") return;
    setCareerAiError("");
    try {
      setCareerAiJob(await triggerTrainingCareerAiAnalysis("grid-shot"));
    } catch (error) {
      setCareerAiError(error instanceof Error ? error.message : tx("AI 综合分析请求失败", "Career analysis request failed"));
    }
  };

  const systemFinding = !overview.validSessions
    ? { title: tx("等待有效训练数据", "Waiting for valid training data"), description: tx("完成训练后，系统会从准确率、速度、稳定度和阶段表现中生成解读。", "Complete a session to generate a readout from accuracy, pace, consistency, and phase performance.") }
    : trendOverview.recentScoreDeltaPercent !== null && trendOverview.recentScoreDeltaPercent > 2
      ? { title: tx("近期整体表现正在提升", "Recent overall performance is improving"), description: tx("当前变化来自同配置记录；系统会继续确认准度、速度与稳定度能否同步保持。", "The change comes from comparable sessions; the system will keep checking whether accuracy, pace, and consistency hold together.") }
      : trendOverview.recentScoreDeltaPercent !== null && trendOverview.recentScoreDeltaPercent < -2
        ? { title: tx("近期整体表现有所回落", "Recent overall performance has declined"), description: tx("先查看下方能力维度和单局分析，只针对最明显的一项变化进行调整。", "Review the capability dimensions and session analysis, then adjust only the clearest change.") }
        : { title: tx("当前表现整体稳定", "Current performance is stable"), description: tx("暂未发现明确变化，系统会继续根据同配置有效记录更新判断。", "No clear change is evident; the system will keep updating from comparable valid sessions.") };
  const visibleSessions = showAll ? sessions : sessions.slice(0, 12);

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
          <p>{tx("每一局有效训练都会进入项目档案；趋势只比较配置一致的记录，避免不同难度互相干扰。", "Every valid session contributes to the profile; trends compare matching setups so different difficulties do not distort the result.")}</p>
          <div className="career-hero-actions">
            <button type="button" onClick={onBrowseTraining}><Play size={16} fill="currentColor" />{tx("选择训练", "Choose training")}</button>
          </div>
        </div>
        <div className="career-personal-best">
          <small>{tx("全部训练最佳效率", "All-session best pace")}</small>
          <strong>{overview.bestScorePerMinute ? formatNumber(overview.bestScorePerMinute) : "-"}</strong>
          <em>{tx("分 / 分钟", "pts / min")}</em>
          <span>{overview.validSessions ? `${overview.validSessions} ${tx("局有效记录", "valid sessions")}` : tx("等待第一局成绩", "Awaiting first session")}</span>
        </div>
      </section>

      <section className="career-metric-grid">
        <CareerMetric icon={CalendarDays} label={tx("训练记录", "Sessions")} value={formatNumber(overview.totalSessions)} note={`${tx("累计时长", "Total time")} ${formatDuration(overview.totalDurationMs)}`} />
        <CareerMetric icon={Award} label={tx("平均效率", "Average pace")} value={overview.validSessions ? formatNumber(overview.averageScorePerMinute) : "-"} note={`${tx("分 / 分钟", "pts / min")} · ${tx("近 5 局", "last five")} ${formatDelta(overview.recentScoreDeltaPercent)}`} />
        <CareerMetric icon={Crosshair} label={tx("平均准确率", "Average accuracy")} value={overview.validSessions ? `${overview.averageAccuracy.toFixed(1)}%` : "-"} note={`${tx("近 5 局变化", "Last five")} ${formatDelta(overview.recentAccuracyDelta, tx(" 个百分点", " pp"))}`} />
        <CareerMetric icon={Gauge} label={tx("目标切换", "Target pace")} value={overview.validSessions ? overview.averageTargetsPerMinute.toFixed(1) : "-"} note={`TPM · ${tx("最高连击", "Best streak")} ×${overview.bestCombo}`} />
      </section>

      <section className="career-data-panel career-ai-panel" data-state={careerAiJob?.status ?? "NOT_REQUESTED"}>
          <header>
            <div><BrainCircuit size={16} /><h2>{tx("AI 训练教练", "AI training coach")}</h2></div>
            <span>{confidenceLabel(careerAiJob?.confidence ?? (comparableValidSessions >= 10 ? "STABLE" : comparableValidSessions >= 5 ? "LOW" : "INITIAL"))}</span>
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
                    <div><small>{tx("建议", "Suggestion")}</small><b>{careerAiJob.analysis.nextAction.title}</b><p>{careerAiJob.analysis.nextAction.description}</p></div>
                    <div>{careerAiJob.analysis.nextAction.targets.map((target) => <span key={target.metric}><small>{target.label}</small><b>{targetValue(target)}</b></span>)}</div>
                  </div>
                </>
              ) : (
                <>
                  <h3>{comparableValidSessions < 3
                    ? tx("同配置数据暂时不足", "Not enough comparable data yet")
                    : tx("当前记录可以进行综合分析", "The current records are ready for analysis")}</h3>
                  <p>{comparableValidSessions < 3
                    ? tx(`当前配置有 ${comparableValidSessions} 局有效记录。AI 只比较配置一致的数据，避免把难度差异误判为能力变化。`, `The current setup has ${comparableValidSessions} valid sessions. AI compares matching setups only, so difficulty changes are not mistaken for skill changes.`)
                    : tx(`${comparableValidSessions} 局同配置有效记录将用于本次分析，训练类型不会影响档案资格。`, `${comparableValidSessions} valid matching sessions will be analyzed; session type does not affect profile eligibility.`)}</p>
                </>
              )}
              {(careerAiError || careerAiJob?.failureMessage) && <div className="career-ai-error"><ShieldAlert size={14} />{careerAiJob?.failureMessage || careerAiError}</div>}
              {careerAiJob?.status === "READY" && (
                <small className="career-ai-usage">{careerAiJob.cacheHit
                  ? tx("已命中数据缓存，本次未再次消耗 Token。", "Cached result; no additional tokens used.")
                  : tx(`本次使用 ${careerAiJob.inputTokens + careerAiJob.outputTokens} Token · ${careerAiJob.model}`, `${careerAiJob.inputTokens + careerAiJob.outputTokens} tokens · ${careerAiJob.model}`)}</small>
              )}
            </div>
            <button
              type="button"
              disabled={comparableValidSessions < 3 || careerAiJob?.status === "PENDING"}
              title={comparableValidSessions < 3 ? tx("至少需要 3 局同配置有效记录", "At least three valid matching sessions are required") : undefined}
              onClick={() => void triggerCareerAi()}
            >
              {careerAiJob?.status === "PENDING" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
              {comparableValidSessions < 3
                ? tx("数据不足", "Insufficient data")
                : careerAiJob?.status === "READY" && careerAiJob.stale
                  ? tx("按最新记录重新分析", "Analyze latest sessions")
                  : tx("生成综合分析", "Generate analysis")}
            </button>
          </div>
      </section>

      <section className="career-overview-grid">
        <section className="career-data-panel career-trend-panel">
          <header>
            <div><Activity size={16} /><h2>{tx("最近表现趋势", "Recent performance")}</h2></div>
            <span>{careerProfile?.cohort
              ? tx(`${comparableValidSessions} 局同配置有效记录`, `${comparableValidSessions} valid matching sessions`)
              : tx("等待可比较记录", "Waiting for comparable sessions")}</span>
          </header>
          {trendOverview.trend.length > 1 ? (
            <div className="career-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendOverview.trend} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
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
            {careerProfile && <span>{careerProfile.sample.comparableSessions} {tx("局可比记录", "comparable sessions")} · {profileConfidenceLabel(careerProfile.sample.confidence)}</span>}
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
          <div><BrainCircuit size={16} /><h2>{tx("系统分析", "System analysis")}</h2></div>
          <span>{careerProfile ? profileConfidenceLabel(careerProfile.sample.confidence) : tx("等待有效数据", "Awaiting valid data")}</span>
        </header>
        <div className="career-project-analysis-body">
          <div><small>{tx("当前结论", "CURRENT FINDING")}</small><h3>{systemFinding.title}</h3><p>{systemFinding.description}</p></div>
          <div><small>{tx("数据来源", "DATA SOURCE")}</small><b>{tx("Grid Shot 训练记录", "Grid Shot training sessions")}</b><p>{tx("这里专注展示你在这个训练项目中的长期表现。", "This view focuses on your long-term performance in this training project.")}</p></div>
        </div>
      </section>

      <section className="career-data-panel career-history-panel">
        <header>
          <div><Clock3 size={16} /><h2>{tx("全部 Grid Shot 记录", "All Grid Shot history")}</h2></div>
          <div className="career-history-actions">
            {loading && <span><LoaderCircle className="spin" size={13} />{tx("同步中", "Syncing")}</span>}
            <button type="button" onClick={onRefresh} aria-label={tx("刷新记录", "Refresh history")}><RefreshCw size={14} /></button>
          </div>
        </header>
        {loadError && <div className="career-inline-notice"><CloudOff size={14} />{loadError}</div>}
        {sessions.length ? (
          <>
            <div className="career-session-list">
              <div className="career-session-head"><span>{tx("时间", "Date")}</span><span>{tx("得分", "Score")}</span><span>{tx("准确率", "Accuracy")}</span><span>TPM</span><span>{tx("稳定性", "Stability")}</span><span>{tx("评级", "Grade")}</span><span /></div>
              {visibleSessions.map((session) => (
                <button type="button" className="career-session-row" data-integrity={session.integrityStatus.toLowerCase()} key={session.key} onClick={() => onOpenSession(session.key)}>
                  <span><time>{formatDate(session.completedAt)}</time><small>{Math.round(session.durationMs / 1_000)}s · {session.configurationKey.split(":").at(-1) ?? "-"} · {session.source === "cloud" ? tx("云端", "Cloud") : tx("本地", "Local")}</small></span>
                  <b>{formatNumber(session.score)}</b>
                  <span>{session.accuracy.toFixed(1)}%</span>
                  <span>{session.targetsPerMinute.toFixed(1)}</span>
                  <span>{Math.round(session.consistencyScore)}</span>
                  <em>{session.grade}</em>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            {sessions.length > 12 && <button type="button" className="career-show-all" onClick={() => setShowAll((value) => !value)}>{showAll ? tx("收起记录", "Show less") : `${tx("查看全部", "Show all")} ${sessions.length} ${tx("局", "sessions")}`}</button>}
          </>
        ) : !loading && (
          <div className="career-empty-state">
            <Crosshair size={28} />
            <h3>{tx("还没有 Grid Shot 记录", "No Grid Shot sessions yet")}</h3>
            <p>{tx("完成一局后，这里会自动生成生涯数据。", "Complete a session and your career data will appear here.")}</p>
            <button type="button" onClick={onBrowseTraining}>{tx("选择训练", "Choose training")}</button>
          </div>
        )}
      </section>
    </main>
  );
}
