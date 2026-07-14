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
  Cloud,
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
  Zap,
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
import { useAuthStore } from "../features/auth/authStore";
import { activeModelProvider, readModelApiSettings } from "../game/analysis/modelApiSettings";
import {
  getTrainingCareerAiAnalysis,
  triggerTrainingCareerAiAnalysis,
  type TrainingCareerAiConfidence,
  type TrainingCareerAiJob,
} from "../game/analysis/trainingCareerAiAnalysisService";
import {
  adoptTrainingCoachingTask,
  getTrainingCoachingTask,
  type TrainingCoachingTask,
} from "../game/analysis/trainingCoachingTaskService";
import type { TrainingAnalysisTarget } from "../game/analysis/trainingAnalysis";
import {
  cloudGridShotCareerDetail,
  isGridShotBenchmarkSession,
  localGridShotCareerDetail,
  mergeGridShotCareerSessions,
  summarizeGridShotCareer,
  type GridShotCareerDetail,
  type GridShotCareerSession,
} from "../game/career/gridShotCareer";
import {
  getTrainingCareerProfile,
  type TrainingCareerDimensionProfile,
  type TrainingCareerMetricProfile,
  type TrainingCareerProfile,
  type TrainingCareerProfileConfidence,
} from "../game/career/trainingCareerProfileService";
import { analyzeGridShotEvents, median } from "../game/modes/gridShot/gridShotAnalytics";
import {
  GRID_SHOT_BENCHMARK,
  type GridShotTargetSize,
} from "../game/modes/gridShot/gridShotConfig";
import {
  getTrainingSessionDetail,
  listAllTrainingSessions,
} from "../game/storage/trainingSessionService";
import { readHistory } from "../game/storage/trainingStorage";
import { getAppLanguage, tx } from "../i18n";
import "./careerPage.css";

interface CareerPageProps {
  targetSize: GridShotTargetSize;
  onStartBenchmark: () => void;
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

function DetailMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}

function DetailTable({ detail }: { detail: GridShotCareerDetail }) {
  const analytics = useMemo(() => analyzeGridShotEvents(detail.events, {
    sessionDurationMs: detail.session.durationMs,
    activeDurationMs: detail.session.durationMs,
  }), [detail]);
  const intervals = detail.events
    .filter((event) => event.type === "hit" && event.hitIntervalMs !== undefined)
    .map((event) => event.hitIntervalMs as number);
  const phaseNames = [tx("起步", "Opening"), tx("中段", "Middle"), tx("收尾", "Finish")];
  const analysis = detail.analysis;
  return (
    <div className="career-detail-stack">
      <section className="career-detail-metrics">
        <DetailMetric label={tx("得分", "Score")} value={formatNumber(detail.session.score)} hint={`${tx("评级", "Grade")} ${detail.session.grade}`} />
        <DetailMetric label={tx("准确率", "Accuracy")} value={`${detail.session.accuracy.toFixed(1)}%`} hint={`${detail.session.hits} ${tx("命中", "hits")} · ${detail.session.misses} ${tx("失误", "misses")}`} />
        <DetailMetric label={tx("击中速度", "Hit pace")} value={detail.session.targetsPerMinute.toFixed(1)} hint="TPM" />
        <DetailMetric label={tx("平均击中间隔", "Average hit interval")} value={`${Math.round(detail.session.averageHitInterval)}ms`} hint={tx("相邻命中", "Between hits")} />
        <DetailMetric label={tx("节奏稳定性", "Rhythm stability")} value={formatNumber(detail.session.consistencyScore)} hint="/ 100" />
        <DetailMetric label={tx("最高连续命中", "Best streak")} value={`×${detail.session.maxCombo}`} hint={tx("本局最高", "Session best")} />
        <DetailMetric label={tx("最快击中间隔", "Fastest interval")} value={`${Math.round(analytics.fastestHitInterval)}ms`} hint={`${tx("中位数", "Median")} ${Math.round(median(intervals))}ms`} />
        <DetailMetric label={tx("平均目标存活", "Average target lifetime")} value={`${Math.round(analytics.averageTargetLifetime)}ms`} hint={`${tx("最慢间隔", "Slowest interval")} ${Math.round(analytics.slowestHitInterval)}ms`} />
      </section>

      {analysis && (
        <section className="career-data-panel career-saved-analysis">
          <header>
            <div><Zap size={16} /><h2>{analysis.source === "AI" ? tx("AI 深度分析", "AI analysis") : tx("即时规则分析", "Rule analysis")}</h2></div>
            <span>{analysis.model ?? analysis.engineVersion}</span>
          </header>
          <h3>{analysis.headline}</h3>
          <p>{analysis.summary}</p>
          {analysis.findings.length > 0 && (
            <div className="career-analysis-findings">
              {analysis.findings.map((finding) => (
                <article key={finding.code} data-severity={finding.severity.toLowerCase()}>
                  <b>{finding.title}</b><span>{finding.evidence}</span><p>{finding.advice}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="career-data-panel">
        <header>
          <div><Activity size={16} /><h2>{tx("三阶段表现", "Three-phase performance")}</h2></div>
          <span>{tx("按本局时长等分", "Equal session thirds")}</span>
        </header>
        <div className="career-table-wrap">
          <table className="career-data-table phase-table">
            <thead><tr><th>{tx("阶段", "Phase")}</th><th>{tx("时段", "Window")}</th><th>{tx("准确率", "Accuracy")}</th><th>TPM</th><th>{tx("命中 / 失误", "Hits / misses")}</th><th>{tx("平均间隔", "Avg interval")}</th><th>{tx("稳定性", "Stability")}</th><th>{tx("得分", "Score")}</th></tr></thead>
            <tbody>
              {detail.analysisSnapshot.windows.map((window, index) => (
                <tr key={`${window.startMs}-${window.endMs}`}>
                  <td><b>{phaseNames[index] ?? `${tx("阶段", "Phase")} ${index + 1}`}</b></td>
                  <td>{window.startMs / 1_000}-{window.endMs / 1_000}s</td>
                  <td>{window.accuracy.toFixed(1)}%</td>
                  <td>{window.targetsPerMinute.toFixed(1)}</td>
                  <td>{window.hits} / {window.misses}</td>
                  <td>{Math.round(window.averageHitInterval)}ms</td>
                  <td>{Math.round(window.consistencyScore)}</td>
                  <td>{formatNumber(window.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="career-data-panel">
        <header>
          <div><BarChart3 size={16} /><h2>{tx("每 5 秒表现", "Five-second breakdown")}</h2></div>
          <span>{tx("完整时间切片", "Complete timeline")}</span>
        </header>
        <div className="career-table-wrap">
          <table className="career-data-table segment-table">
            <thead><tr><th>{tx("时段", "Window")}</th><th>{tx("准确率", "Accuracy")}</th><th>TPM</th><th>{tx("命中 / 失误", "Hits / misses")}</th><th>{tx("平均间隔", "Avg interval")}</th><th>{tx("稳定性", "Stability")}</th><th>{tx("最高连击", "Best streak")}</th><th>{tx("得分", "Score")}</th></tr></thead>
            <tbody>
              {detail.segments.map((segment) => (
                <tr key={segment.index}>
                  <td><b>{segment.startMs / 1_000}-{segment.endMs / 1_000}s</b></td>
                  <td>{segment.accuracy.toFixed(1)}%</td>
                  <td>{segment.targetsPerMinute.toFixed(1)}</td>
                  <td>{segment.hits} / {segment.misses}</td>
                  <td>{Math.round(segment.averageHitInterval)}ms</td>
                  <td>{Math.round(segment.consistencyScore)}</td>
                  <td>×{segment.maxCombo}</td>
                  <td>{formatNumber(segment.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="career-detail-columns">
        <section className="career-data-panel score-detail-panel">
          <header><div><Award size={16} /><h2>{tx("得分构成", "Score composition")}</h2></div></header>
          <dl>
            <div><dt>{tx("基础命中", "Base hits")}</dt><dd>{formatNumber(analytics.baseScoreTotal)}</dd></div>
            <div><dt>{tx("速度奖励", "Speed bonus")}</dt><dd>{formatNumber(analytics.speedBonusTotal)}</dd></div>
            <div><dt>{tx("连击奖励", "Streak bonus")}</dt><dd>{formatNumber(analytics.comboBonusTotal)}</dd></div>
            <div><dt>{tx("稳定奖励", "Stability bonus")}</dt><dd>{formatNumber(analytics.stabilityBonusTotal)}</dd></div>
            <div className="total"><dt>{tx("总得分", "Total")}</dt><dd>{formatNumber(analytics.score)}</dd></div>
          </dl>
        </section>
        <section className="career-data-panel configuration-panel">
          <header><div><Gauge size={16} /><h2>{tx("本局配置", "Session configuration")}</h2></div></header>
          <dl>
            <div><dt>{tx("训练时长", "Duration")}</dt><dd>{detail.session.durationMs / 1_000}s</dd></div>
            <div><dt>{tx("目标大小", "Target size")}</dt><dd>{String(detail.configuration.targetSize ?? "-")}</dd></div>
            <div><dt>{tx("同时目标", "Active targets")}</dt><dd>{String(detail.configuration.activeTargetCount ?? 3)}</dd></div>
            <div><dt>{tx("模式版本", "Mode version")}</dt><dd>v{detail.session.modeVersion}</dd></div>
            <div><dt>{tx("计分版本", "Scoring version")}</dt><dd>v{detail.session.scoringVersion}</dd></div>
          </dl>
        </section>
      </div>

      <details className="career-event-log career-data-panel">
        <summary><span><Crosshair size={16} />{tx("逐次操作记录", "Event log")}</span><b>{detail.events.length} {tx("条", "events")}</b></summary>
        <div className="career-table-wrap event-table-wrap">
          <table className="career-data-table event-table">
            <thead><tr><th>#</th><th>{tx("时间", "Time")}</th><th>{tx("结果", "Result")}</th><th>{tx("击中间隔", "Hit interval")}</th><th>{tx("目标存活", "Target lifetime")}</th><th>{tx("连击", "Streak")}</th><th>{tx("基础", "Base")}</th><th>{tx("速度", "Speed")}</th><th>{tx("连击奖励", "Streak bonus")}</th><th>{tx("稳定奖励", "Stability bonus")}</th><th>{tx("本次得分", "Points")}</th></tr></thead>
            <tbody>
              {detail.events.map((event, index) => (
                <tr key={event.id} data-result={event.type}>
                  <td>{index + 1}</td>
                  <td>{(event.elapsedMs / 1_000).toFixed(2)}s</td>
                  <td><b>{event.type === "hit" ? tx("命中", "Hit") : tx("失误", "Miss")}</b></td>
                  <td>{event.hitIntervalMs === undefined ? "-" : `${Math.round(event.hitIntervalMs)}ms`}</td>
                  <td>{event.targetLifetimeMs === undefined ? "-" : `${Math.round(event.targetLifetimeMs)}ms`}</td>
                  <td>×{event.comboAfter}</td>
                  <td>{formatNumber(event.baseScore)}</td>
                  <td>{formatNumber(event.speedBonus)}</td>
                  <td>{formatNumber(event.comboBonus)}</td>
                  <td>{formatNumber(event.stabilityBonus)}</td>
                  <td>{formatNumber(event.totalScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function CareerSessionDetail({
  session,
  detail,
  loading,
  error,
  onBack,
}: {
  session: GridShotCareerSession;
  detail: GridShotCareerDetail | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <main className="workspace-main career-page career-detail-page">
      <header className="career-detail-header">
        <button type="button" onClick={onBack}><ArrowLeft size={16} />{tx("返回生涯", "Back to career")}</button>
        <div>
          <span>GRID SHOT · {formatDate(session.completedAt)}</span>
          <h1>{tx("单局详细记录", "Session detail")}</h1>
        </div>
        <div className={`career-source ${session.source}`}>
          {session.source === "cloud" ? <Cloud size={15} /> : <CloudOff size={15} />}
          {session.source === "cloud" ? tx("云端记录", "Cloud record") : tx("本地记录", "Local record")}
        </div>
      </header>
      {loading && !detail && <div className="career-loading"><LoaderCircle className="spin" />{tx("正在读取详细数据", "Loading session data")}</div>}
      {error && !detail && <div className="career-error"><ShieldAlert size={18} /><span>{error}</span></div>}
      {detail && <DetailTable detail={detail} />}
      {loading && detail && <div className="career-detail-sync"><LoaderCircle className="spin" size={14} />{tx("正在同步云端详情", "Syncing cloud detail")}</div>}
    </main>
  );
}

export function CareerPage({ targetSize, onStartBenchmark, onBrowseTraining }: CareerPageProps) {
  const authStatus = useAuthStore((state) => state.status);
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const [sessions, setSessions] = useState<GridShotCareerSession[]>(() => (
    mergeGridShotCareerSessions([], readHistory())
  ));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useState<CareerScope>("benchmark");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<GridShotCareerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [careerProfile, setCareerProfile] = useState<TrainingCareerProfile | null>(null);
  const [apiSettings] = useState(() => readModelApiSettings());
  const [careerAiJob, setCareerAiJob] = useState<TrainingCareerAiJob>();
  const [careerAiError, setCareerAiError] = useState("");
  const [coachingTask, setCoachingTask] = useState<TrainingCoachingTask | null>(null);
  const [coachingError, setCoachingError] = useState("");
  const [adoptingGoal, setAdoptingGoal] = useState(false);
  const activeApiConfig = activeModelProvider(apiSettings);

  useEffect(() => {
    let active = true;
    const local = readHistory();
    setSessions(mergeGridShotCareerSessions([], local));
    setLoadError(null);
    if (authStatus !== "authenticated") {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void listAllTrainingSessions("grid-shot").then((cloud) => {
      if (!active) return;
      setSessions(mergeGridShotCareerSessions(cloud, local));
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setLoadError(tx("云端记录暂时无法读取，当前显示本地数据。", "Cloud history is unavailable. Showing local data."));
      setLoading(false);
    });
    return () => { active = false; };
  }, [authStatus, refreshKey]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setCareerProfile(null);
      return;
    }
    let active = true;
    void getTrainingCareerProfile("grid-shot").then((profile) => {
      if (active) setCareerProfile(profile);
    }).catch(() => {
      if (active) setCareerProfile(null);
    });
    return () => { active = false; };
  }, [authStatus, refreshKey]);

  const selected = sessions.find((session) => session.key === selectedKey) ?? null;
  useEffect(() => {
    let active = true;
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return () => { active = false; };
    }
    const localDetail = localGridShotCareerDetail(selected, targetSize);
    setDetail(localDetail);
    setDetailError(null);
    if (selected.source !== "cloud" || !selected.serverId) {
      setDetailLoading(false);
      if (!localDetail) setDetailError(tx("这条本地记录缺少详细事件。", "This local session has no event detail."));
      return () => { active = false; };
    }
    setDetailLoading(true);
    void getTrainingSessionDetail(selected.serverId).then((response) => {
      if (!active) return;
      setDetail(cloudGridShotCareerDetail(selected, response));
      setDetailLoading(false);
    }).catch(() => {
      if (!active) return;
      setDetailLoading(false);
      if (!localDetail) setDetailError(tx("无法读取这局训练的云端详情。", "Unable to load this session detail."));
    });
    return () => { active = false; };
  }, [selected, targetSize]);

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
    if (!isAdmin || authStatus !== "authenticated" || cloudBenchmarkValidSessions < 3) return;
    let active = true;
    void getTrainingCareerAiAnalysis("grid-shot").then((job) => {
      if (active) setCareerAiJob(job);
    }).catch(() => {
      if (active) setCareerAiError(tx("暂时无法读取综合分析状态", "Could not load career analysis status"));
    });
    return () => { active = false; };
  }, [authStatus, cloudBenchmarkValidSessions, isAdmin]);

  useEffect(() => {
    if (!isAdmin || authStatus !== "authenticated") {
      setCoachingTask(null);
      return;
    }
    let active = true;
    void getTrainingCoachingTask("grid-shot").then((task) => {
      if (active) setCoachingTask(task);
    }).catch(() => {
      if (active) setCoachingError(tx("暂时无法读取当前训练目标", "Could not load the active training goal"));
    });
    return () => { active = false; };
  }, [authStatus, isAdmin, refreshKey]);

  useEffect(() => {
    if (!isAdmin || careerAiJob?.status !== "PENDING") return;
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
  }, [careerAiJob?.status, isAdmin]);

  const triggerCareerAi = async () => {
    if (!isAdmin || cloudBenchmarkValidSessions < 3 || !activeApiConfig.apiKey.trim()
      || careerAiJob?.status === "PENDING") return;
    setCareerAiError("");
    try {
      setCareerAiJob(await triggerTrainingCareerAiAnalysis(
        "grid-shot",
        apiSettings.activeProvider,
        activeApiConfig.apiKey,
        activeApiConfig.model,
      ));
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

  const visibleSessions = showAll ? scopedSessions : scopedSessions.slice(0, 12);
  if (selected) {
    return <CareerSessionDetail session={selected} detail={detail} loading={detailLoading} error={detailError} onBack={() => setSelectedKey(null)} />;
  }

  return (
    <main className="workspace-main career-page career-home">
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

      {isAdmin && benchmarkOverview.validSessions >= 3 && (
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
                  <div className="career-ai-task-actions">
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
                  </div>
                  {coachingTask?.status === "ACTIVE" && coachingTask.sourceAnalysisCallId === careerAiJob.callId && (
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
              {(careerAiError || coachingError || careerAiJob?.failureMessage) && <div className="career-ai-error"><ShieldAlert size={14} />{careerAiJob?.failureMessage || coachingError || careerAiError}</div>}
              {careerAiJob?.status === "READY" && (
                <small className="career-ai-usage">{careerAiJob.cacheHit
                  ? tx("已命中数据缓存，本次未再次消耗 Token。", "Cached result; no additional tokens used.")
                  : tx(`本次使用 ${careerAiJob.inputTokens + careerAiJob.outputTokens} Token · ${careerAiJob.model}`, `${careerAiJob.inputTokens + careerAiJob.outputTokens} tokens · ${careerAiJob.model}`)}</small>
              )}
            </div>
            <button
              type="button"
              disabled={cloudBenchmarkValidSessions < 3 || !activeApiConfig.apiKey.trim() || careerAiJob?.status === "PENDING"}
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

      <section className="career-data-panel career-history-panel">
        <header>
          <div><Clock3 size={16} /><h2>{scope === "benchmark" ? tx("基准训练记录", "Benchmark history") : tx("全部 Grid Shot 记录", "All Grid Shot history")}</h2></div>
          <div className="career-history-actions">
            {loading && <span><LoaderCircle className="spin" size={13} />{tx("同步中", "Syncing")}</span>}
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} aria-label={tx("刷新记录", "Refresh history")}><RefreshCw size={14} /></button>
          </div>
        </header>
        {loadError && <div className="career-inline-notice"><CloudOff size={14} />{loadError}</div>}
        {scopedSessions.length ? (
          <>
            <div className="career-session-list">
              <div className="career-session-head"><span>{tx("时间", "Date")}</span><span>{tx("得分", "Score")}</span><span>{tx("准确率", "Accuracy")}</span><span>TPM</span><span>{tx("稳定性", "Stability")}</span><span>{tx("评级", "Grade")}</span><span /></div>
              {visibleSessions.map((session) => (
                <button type="button" className="career-session-row" data-integrity={session.integrityStatus.toLowerCase()} key={session.key} onClick={() => setSelectedKey(session.key)}>
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
