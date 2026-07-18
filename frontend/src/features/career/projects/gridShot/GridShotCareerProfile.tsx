import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crosshair,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
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
  type TrainingCareerAiJob,
} from "../../../../game/analysis/trainingCareerAiAnalysisService";
import type { TrainingAnalysisTarget } from "../../../../game/analysis/trainingAnalysis";
import { summarizeGridShotCareer, type GridShotCareerSession } from "../../../../game/career/gridShotCareer";
import { formatGridShotConfigurationLabel } from "../../../../game/modes/gridShot/gridShotConfigurationLabel";
import { getAppLanguage, tx } from "../../../../i18n";
import type { GridShotCareerProjectData } from "./gridShotCareerProjectData";
import {
  buildGridShotSequenceTicks,
  buildGridShotScoreTrend,
  calculateGridShotTargetsPerMinute,
  filterGridShotSessionsByRange,
  listGridShotPracticeConfigurations,
  summarizeGridShotAbility,
  summarizeGridShotPresentation,
  type GridShotCareerRange,
} from "./gridShotCareerPresentation";
import { CareerDataStatus } from "../../CareerDataStatus";
import { CAREER_OVERVIEW_PAGE_SIZE, getCareerOverviewPaginationItems } from "../../careerOverviewPagination";
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
const GRID_SHOT_CAREER_AI_PROMPT_VERSION = "grid-shot-career-v11";

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
  return minutes
    ? tx(`${hours} 小时 ${minutes} 分钟`, `${hours}h ${minutes}m`)
    : tx(`${hours} 小时`, `${hours}h`);
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
  note?: string;
}) {
  return (
    <article className="career-metric">
      <span><Icon size={17} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <p>{note}</p>}
    </article>
  );
}

function rangeLabel(range: GridShotCareerRange) {
  if (range === "7d") return tx("最近 7 天", "Last 7 days");
  if (range === "30d") return tx("最近 30 天", "Last 30 days");
  return tx("全部记录", "All records");
}

function decimal(value: number) {
  return value.toFixed(1);
}

function buildScoreChartDomain(values: readonly number[]): [number, number] {
  if (!values.length) return [0, 2_000];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const padding = Math.max(500, (maximum - minimum) * 0.14);
  const lower = Math.max(0, Math.floor((minimum - padding) / 1_000) * 1_000);
  const upper = Math.ceil((maximum + padding) / 1_000) * 1_000;
  return upper > lower ? [lower, upper] : [lower, lower + 2_000];
}

function PerformanceDataLane({
  kind,
  label,
  configurationLabel,
  sessions,
  control,
}: {
  kind: "standard" | "practice";
  label: string;
  configurationLabel: string;
  sessions: readonly GridShotCareerSession[];
  control?: ReactNode;
}) {
  const summary = summarizeGridShotPresentation(sessions);
  const ability = summarizeGridShotAbility(sessions);
  const data = buildGridShotScoreTrend(sessions).map((point, index) => ({
    ...point,
    sequence: index + 1,
  }));
  const sequenceTicks = buildGridShotSequenceTicks(data.length);
  const sequenceDomain: [number, number] = data.length <= 1 ? [0.5, 1.5] : [1, data.length];
  const scoreDomain = buildScoreChartDomain(data.map((point) => point.score));
  const firstDate = data.length ? formatDate(data[0].completedAt, false) : "-";
  const lastDate = data.length ? formatDate(data.at(-1)?.completedAt ?? data[0].completedAt, false) : "-";
  const period = firstDate === lastDate ? firstDate : `${firstDate} — ${lastDate}`;
  const stroke = kind === "standard" ? "#65dfe7" : "#a996e6";
  const metrics = [
    {
      key: "pace",
      label: tx("击破速度（TPM）", "Hit pace (TPM)"),
      value: decimal(ability.hitPace.average),
      unit: tx("目标/分钟", "targets/min"),
      detail: tx(`范围 ${decimal(ability.hitPace.minimum)}–${decimal(ability.hitPace.maximum)}`, `Range ${decimal(ability.hitPace.minimum)}–${decimal(ability.hitPace.maximum)}`),
    },
    {
      key: "accuracy",
      label: tx("命中率", "Accuracy"),
      value: decimal(ability.accuracy.average),
      unit: "%",
      detail: tx(`范围 ${decimal(ability.accuracy.minimum)}%–${decimal(ability.accuracy.maximum)}%`, `Range ${decimal(ability.accuracy.minimum)}%–${decimal(ability.accuracy.maximum)}%`),
    },
    {
      key: "combo",
      label: tx("最高连击", "Max combo"),
      value: decimal(ability.maxCombo.average),
      unit: tx("次", "hits"),
      detail: tx(`范围 ${formatNumber(ability.maxCombo.minimum)}–${formatNumber(ability.maxCombo.maximum)}`, `Range ${formatNumber(ability.maxCombo.minimum)}–${formatNumber(ability.maxCombo.maximum)}`),
    },
    {
      key: "misses",
      label: tx("失误频率", "Miss frequency"),
      value: decimal(ability.missesPerMinute.average),
      unit: tx("次/分", "misses/min"),
      detail: tx(`范围 ${decimal(ability.missesPerMinute.minimum)}–${decimal(ability.missesPerMinute.maximum)}`, `Range ${decimal(ability.missesPerMinute.minimum)}–${decimal(ability.missesPerMinute.maximum)}`),
    },
  ];
  return (
    <section className="grid-shot-performance-lane" data-kind={kind}>
      <header>
        <div className="grid-shot-data-lane-title">
          <i aria-hidden="true" />
          <div><h3>{label}</h3><small>{configurationLabel}</small></div>
        </div>
        {control ?? <span>{summary.sessionCount} {tx("局有效记录", "valid sessions")}</span>}
      </header>
      <div className="grid-shot-lane-summary">
        <span><small>{tx("训练局数", "Sessions")}</small><b>{summary.sessionCount}</b></span>
        <span><small>{tx("平均分", "Average score")}</small><b>{summary.sessionCount ? formatNumber(summary.averageScore) : "-"}</b></span>
        <span><small>{tx("最高分", "High score")}</small><b>{summary.sessionCount ? formatNumber(summary.bestScore) : "-"}</b></span>
      </div>
      {data.length ? (
        <>
          <div className="grid-shot-chart-head">
            <div>
              <h4>{tx("得分走势", "Score trend")}</h4>
              <small>{period} · {tx("按训练局次排列", "ordered by session")}</small>
            </div>
          </div>
          <div className="career-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 22, bottom: 10, left: 4 }}>
                <CartesianGrid stroke="#17313a" vertical={false} />
                <XAxis
                  dataKey="sequence"
                  type="number"
                  domain={sequenceDomain}
                  allowDataOverflow
                  ticks={sequenceTicks}
                  interval={0}
                  tickFormatter={(value) => formatNumber(Math.round(Number(value)))}
                  stroke="#71878e"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  fontSize={10}
                />
                <YAxis stroke="#71878e" tickLine={false} axisLine={false} fontSize={10} width={56} domain={scoreDomain} tickCount={4} tickFormatter={(value) => formatNumber(Number(value))} />
                <Tooltip
                  contentStyle={{ background: "#07151c", border: "1px solid #294852", borderRadius: 4, fontSize: 11 }}
                  cursor={{ stroke: "#36535d", strokeDasharray: "3 4" }}
                  labelFormatter={(value) => {
                    const sequence = Math.round(Number(value));
                    const point = data.find((item) => item.sequence === sequence);
                    return point
                      ? `${formatDate(point.completedAt)} · ${tx(`第 ${sequence} 局`, `Session ${sequence}`)}`
                      : tx(`第 ${sequence} 局`, `Session ${sequence}`);
                  }}
                  formatter={(value) => formatNumber(Number(value))}
                />
                <Line isAnimationActive={false} type="linear" dataKey="score" name={tx("单局得分", "Session score")} stroke={stroke} strokeWidth={2} dot={{ r: 2.7, fill: stroke, strokeWidth: 0 }} activeDot={{ r: 4.5, fill: stroke, stroke: "#07151c", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <dl className="grid-shot-lane-ability-data" aria-label={tx(`${label}能力数据`, `${label} capability data`)}>
            {metrics.map((metric) => (
              <div key={metric.key}>
                <dt>{metric.label}</dt>
                <dd><small>{tx("平均", "Average")}</small><b>{metric.value}</b><em>{metric.unit}</em></dd>
                <p>{metric.detail}</p>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="grid-shot-data-empty"><BarChart3 size={20} /><span>{kind === "standard"
          ? tx("所选时间范围内没有标准训练数据", "No standard-training data in this time range")
          : tx("该配置在所选时间范围内没有自由练习数据", "No free-practice data for this setup in this time range")}</span></div>
      )}
    </section>
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
  const loadError = data.notice;
  const [historyPage, setHistoryPage] = useState(0);
  const [dataRange, setDataRange] = useState<GridShotCareerRange>("30d");
  const [practiceConfiguration, setPracticeConfiguration] = useState("");
  const [careerAiJob, setCareerAiJob] = useState<TrainingCareerAiJob>();
  const [careerAiError, setCareerAiError] = useState("");
  const authStatus = authenticated ? "authenticated" : "anonymous";
  const overview = useMemo(() => summarizeGridShotCareer(sessions), [sessions]);
  const standardSessions = useMemo(() => sessions.filter((session) => (
    session.sessionType === "benchmark" && session.integrityStatus === "VALID"
  )), [sessions]);
  const practiceSessions = useMemo(() => sessions.filter((session) => (
    session.sessionType === "practice" && session.integrityStatus === "VALID"
  )), [sessions]);
  const standardBestScore = useMemo(
    () => standardSessions.reduce((best, session) => Math.max(best, session.score), 0),
    [standardSessions],
  );
  const standardAverageScore = useMemo(
    () => average(standardSessions.map((session) => session.score)),
    [standardSessions],
  );
  const standardAverageHits = useMemo(
    () => average(standardSessions.map((session) => session.hits)),
    [standardSessions],
  );
  const validHistorySessions = overview.validSessions;
  const aiEligible = authenticated && validHistorySessions >= 3;
  const practiceConfigurations = useMemo(
    () => listGridShotPracticeConfigurations(practiceSessions),
    [practiceSessions],
  );
  const activePracticeConfiguration = practiceConfigurations.some((item) => item.key === practiceConfiguration)
    ? practiceConfiguration
    : practiceConfigurations[0]?.key ?? "";
  const selectedPracticeSessions = useMemo(() => practiceSessions.filter(
    (session) => session.configurationKey === activePracticeConfiguration,
  ), [activePracticeConfiguration, practiceSessions]);
  const [trendRangeNow] = useState(() => Date.now());
  const rangedStandardSessions = useMemo(
    () => filterGridShotSessionsByRange(standardSessions, dataRange, trendRangeNow),
    [dataRange, standardSessions, trendRangeNow],
  );
  const rangedPracticeSessions = useMemo(
    () => filterGridShotSessionsByRange(selectedPracticeSessions, dataRange, trendRangeNow),
    [dataRange, selectedPracticeSessions, trendRangeNow],
  );

  useEffect(() => {
    if (authStatus !== "authenticated" || validHistorySessions < 3) return;
    let active = true;
    void getTrainingCareerAiAnalysis("grid-shot").then((job) => {
      if (active) setCareerAiJob(job);
    }).catch(() => {
      if (active) setCareerAiError(tx(
        "综合分析状态加载失败。请检查网络连接与后端服务，然后点击生成综合分析重试。",
        "Career analysis status failed to load. Check the network and backend service, then retry Generate analysis.",
      ));
    });
    return () => { active = false; };
  }, [authStatus, validHistorySessions]);

  useEffect(() => {
    if (authStatus !== "authenticated" || careerAiJob?.status !== "PENDING") return;
    let active = true;
    const timer = window.setInterval(() => {
      void getTrainingCareerAiAnalysis("grid-shot").then((job) => {
        if (active) setCareerAiJob(job);
      }).catch(() => {
        if (active) setCareerAiError(tx(
          "综合分析进度更新失败。任务可能仍在后台运行，请检查网络后重新打开项目档案。",
          "Career analysis progress failed to update. The job may still be running; check the network and reopen the project profile.",
        ));
      });
    }, 1_200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authStatus, careerAiJob?.status]);

  const triggerCareerAi = async () => {
    if (authStatus !== "authenticated" || validHistorySessions < 3
      || careerAiJob?.status === "PENDING") return;
    setCareerAiError("");
    try {
      setCareerAiJob(await triggerTrainingCareerAiAnalysis("grid-shot"));
    } catch (error) {
      setCareerAiError(error instanceof Error
        ? `${tx("综合分析请求失败：", "Career analysis request failed: ")}${error.message} ${tx("请检查网络连接与后端服务后重试。", "Check the network and backend service, then try again.")}`
        : tx(
          "综合分析请求失败，服务没有返回可识别的原因。请检查网络连接与后端服务后重试。",
          "Career analysis failed without a usable service response. Check the network and backend service, then try again.",
        ));
    }
  };

  const historyPageCount = Math.max(1, Math.ceil(sessions.length / CAREER_OVERVIEW_PAGE_SIZE));
  const visibleSessions = useMemo(() => {
    const start = historyPage * CAREER_OVERVIEW_PAGE_SIZE;
    return sessions.slice(start, start + CAREER_OVERVIEW_PAGE_SIZE);
  }, [historyPage, sessions]);
  const historyPaginationItems = useMemo(
    () => getCareerOverviewPaginationItems(historyPage, historyPageCount),
    [historyPage, historyPageCount],
  );

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPageCount - 1));
  }, [historyPageCount]);

  const performanceOverview = (
    <section className="career-overview-grid grid-shot-data-overview">
      <section className="career-data-panel grid-shot-combined-performance">
        <header className="grid-shot-data-section-header">
          <div><Activity size={16} /><h2>{tx("表现趋势", "Performance trend")}</h2></div>
          <div className="grid-shot-range-control" role="group" aria-label={tx("趋势数据范围", "Trend data range")}>
            {(["7d", "30d", "all"] as const).map((range) => (
              <button
                type="button"
                key={range}
                className={dataRange === range ? "active" : undefined}
                aria-pressed={dataRange === range}
                onClick={() => setDataRange(range)}
              >{rangeLabel(range)}</button>
            ))}
          </div>
        </header>
        <div className="grid-shot-combined-lanes">
          <PerformanceDataLane
            kind="standard"
            label={tx("标准训练", "Standard training")}
            configurationLabel={formatGridShotConfigurationLabel("grid-shot:60s:medium")}
            sessions={rangedStandardSessions}
          />
          <PerformanceDataLane
            kind="practice"
            label={tx("自由练习", "Free practice")}
            configurationLabel={activePracticeConfiguration
              ? formatGridShotConfigurationLabel(activePracticeConfiguration)
              : tx("暂无自由练习配置", "No free-practice setup")}
            sessions={rangedPracticeSessions}
            control={(
              <label className="grid-shot-configuration-select">
                <span>{tx("配置", "Setup")}</span>
                <select
                  aria-label={tx("自由练习配置", "Free-practice setup")}
                  disabled={!practiceConfigurations.length}
                  value={activePracticeConfiguration}
                  onChange={(event) => setPracticeConfiguration(event.target.value)}
                >
                  {!practiceConfigurations.length && <option value="">{tx("暂无配置", "No setups")}</option>}
                  {practiceConfigurations.map((configuration) => (
                    <option key={configuration.key} value={configuration.key}>
                      {formatGridShotConfigurationLabel(configuration.key)} · {configuration.count} {tx("局", "sessions")}
                    </option>
                  ))}
                </select>
              </label>
            )}
          />
        </div>
      </section>
    </section>
  );

  const analysisNeedsUpgrade = careerAiJob?.status === "READY"
    && Boolean(careerAiJob.analysis)
    && careerAiJob.promptVersion !== GRID_SHOT_CAREER_AI_PROMPT_VERSION;
  const readyAiAnalysis = careerAiJob?.status === "READY"
    && careerAiJob.promptVersion === GRID_SHOT_CAREER_AI_PROMPT_VERSION
    ? careerAiJob.analysis
    : null;
  const recentAiFinding = readyAiAnalysis?.findings.find((finding) => finding.code.startsWith("RECENT_"));
  const strengthAiFinding = readyAiAnalysis?.findings.find((finding) => (
    finding.severity === "POSITIVE" && !finding.code.startsWith("RECENT_")
  ));
  const priorityAiFinding = readyAiAnalysis?.findings.find((finding) => (
    finding.severity !== "POSITIVE" && !finding.code.startsWith("RECENT_")
  ));

  const aiAnalysisPanel = (
    <section className="career-data-panel career-ai-panel" data-state={careerAiJob?.status ?? "NOT_REQUESTED"}>
      <header className="career-ai-header">
        <div className="career-ai-header-copy"><BrainCircuit size={18} /><h2>{tx("Ai分析", "AI analysis")}</h2></div>
        <div className="career-ai-header-side">
          <button
            type="button"
            disabled={!aiEligible || careerAiJob?.status === "PENDING"}
            title={!authenticated
              ? tx("登录后可以生成训练档案分析", "Sign in to generate career analysis")
              : validHistorySessions < 3
                ? tx("至少需要 3 局有效训练记录", "At least three valid sessions are required")
                : undefined}
            onClick={() => void triggerCareerAi()}
          >
            {careerAiJob?.status === "PENDING" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
            {!authenticated
              ? tx("登录后分析", "Sign in to analyze")
              : validHistorySessions < 3
                ? tx("数据不足", "Insufficient data")
                : analysisNeedsUpgrade
                  ? tx("生成新版分析", "Generate new report")
                  : readyAiAnalysis && careerAiJob?.stale
                  ? tx("更新分析", "Update analysis")
                  : readyAiAnalysis
                    ? tx("重新分析", "Analyze again")
                    : tx("生成分析", "Generate analysis")}
          </button>
        </div>
      </header>

      <div className="career-ai-body">
        {careerAiJob?.status === "PENDING" ? (
          <div className="career-ai-state" role="status">
            <LoaderCircle className="spin" size={22} />
            <div><h3>{tx("正在整理完整训练档案", "Building your complete training profile")}</h3><p>{tx("系统正在汇总全部有效记录，并核对相同配置下的近期变化。", "Aggregating all valid history and checking recent changes within matching setups.")}</p></div>
          </div>
        ) : analysisNeedsUpgrade ? (
          <div className="career-ai-state" data-state="UPGRADE_REQUIRED" role="status">
            <RefreshCw size={22} />
            <div>
              <h3>{tx("分析规则已更新", "The analysis method has been updated")}</h3>
              <p>{tx("旧结果已停止展示。请重新生成，新的分析会使用更清楚的表达，并把所有数据保留在两位小数以内。", "The previous report is hidden. Generate it again for clearer language and numbers limited to two decimal places.")}</p>
            </div>
          </div>
        ) : readyAiAnalysis ? (
          <div className="career-ai-result">
            <section className="career-ai-overview">
              <h3>{readyAiAnalysis.headline}</h3>
              <p className="career-ai-summary">{readyAiAnalysis.summary}</p>
            </section>

            <div className="career-ai-dimensions">
              <section data-tone="strength">
                <header><h4>{tx("做得好的", "What is working")}</h4></header>
                {strengthAiFinding ? (
                  <article>
                    <h5>{strengthAiFinding.title}</h5>
                    <dl><div><dt>{tx("数据", "Data")}</dt><dd>{strengthAiFinding.evidence}</dd></div><div><dt>{tx("说明", "Meaning")}</dt><dd>{strengthAiFinding.advice}</dd></div></dl>
                  </article>
                ) : <p className="career-ai-muted">{tx("目前还没有哪项表现稳定到可以算作优势。", "No part of the current performance is consistent enough to count as a strength yet.")}</p>}
              </section>
              <section data-tone="priority">
                <header><h4>{tx("先改善这个", "Work on this first")}</h4></header>
                {priorityAiFinding ? (
                  <article>
                    <h5>{priorityAiFinding.title}</h5>
                    <dl><div><dt>{tx("数据", "Data")}</dt><dd>{priorityAiFinding.evidence}</dd></div><div><dt>{tx("影响", "Impact")}</dt><dd>{priorityAiFinding.advice}</dd></div></dl>
                  </article>
                ) : <p className="career-ai-muted">{tx("目前没有哪一项明显拖累整体表现。", "Nothing is clearly holding back the overall performance right now.")}</p>}
              </section>
              <section data-tone={recentAiFinding?.severity === "POSITIVE" ? "positive" : recentAiFinding ? "negative" : "neutral"}>
                <header><h4>{tx("最近的变化", "What changed recently")}</h4></header>
                {recentAiFinding ? (
                  <article>
                    <h5>{recentAiFinding.title}</h5>
                    <dl><div><dt>{tx("对比", "Comparison")}</dt><dd>{recentAiFinding.evidence}</dd></div><div><dt>{tx("说明", "Meaning")}</dt><dd>{recentAiFinding.advice}</dd></div></dl>
                  </article>
                ) : <p className="career-ai-muted">{tx("同样设置下的前后记录还不够，暂时看不出可靠变化。", "There are not enough before-and-after results from the same setup to show a reliable change yet.")}</p>}
              </section>
            </div>

            <section className="career-ai-plan">
              <div className="career-ai-plan-copy">
                <h4>{tx("接下来这样练", "Train like this next")}</h4>
                <h3>{readyAiAnalysis.nextAction.title}</h3>
                <p>{readyAiAnalysis.nextAction.description}</p>
              </div>
              <div className="career-ai-targets">
                {readyAiAnalysis.nextAction.targets.map((target) => (
                  <div key={target.metric}><span>{target.label}</span><b>{targetValue(target)}</b></div>
                ))}
              </div>
              {careerAiJob?.stale && <p className="career-ai-stale"><RefreshCw size={13} />{tx("检测到新的训练记录，请更新分析。", "New training data is available; update the analysis.")}</p>}
            </section>
          </div>
        ) : (
          <div className="career-ai-state" data-state={careerAiJob?.status ?? "NOT_REQUESTED"}>
            <Sparkles size={22} />
            <div>
              <h3>{!authenticated
                ? tx("登录后生成个人训练档案", "Sign in to generate your training profile")
                : validHistorySessions < 3
                  ? tx("有效训练记录暂时不足", "Not enough valid training history yet")
                  : careerAiJob?.status === "FAILED" || careerAiJob?.status === "BUDGET_EXHAUSTED"
                    ? tx("本次分析没有完成", "This analysis did not complete")
                    : tx("从完整历史中提炼训练重点", "Turn your complete history into a focused profile")}</h3>
              <p>{!authenticated
                ? tx("登录后，系统会基于你的 GRID SHOT 历史记录生成分析。", "After signing in, the system can analyze your GRID SHOT history.")
                : validHistorySessions < 3
                  ? tx(`当前有 ${validHistorySessions} 局有效记录，累计到 3 局后即可生成分析。`, `You currently have ${validHistorySessions} valid sessions. Analysis unlocks at three.`)
                  : careerAiJob?.failureMessage
                    ? careerAiJob.failureMessage
                    : tx("分析会综合长期表现、近期变化、优势、提升重点和下一步计划。", "The profile covers long-term performance, recent change, strengths, priorities, and a next plan.")}</p>
            </div>
          </div>
        )}
        {careerAiError && <div className="career-ai-error" role="alert"><ShieldAlert size={15} />{careerAiError}</div>}
      </div>
    </section>
  );

  return (
    <main className="workspace-main career-page career-home grid-shot-profile-page">
      <nav className="career-project-breadcrumb" aria-label={tx("页面导航", "Page navigation")}>
        <button type="button" onClick={onBack}><ArrowLeft size={16} />{tx("返回", "Back")}</button>
      </nav>
      <section className="career-hero">
        <div className="career-hero-copy">
          <h1>{tx("GRID SHOT 训练记录", "GRID SHOT Training Records")}</h1>
          <p>{tx("集中查看每局成绩、长期表现与同配置趋势；不同训练配置会被分开比较，避免能力判断失真。", "Review every result, long-term performance, and matching-setup trends in one place. Different setups are compared separately for a fair read.")}</p>
          <div className="career-hero-actions">
            <button type="button" onClick={onBrowseTraining}><Play size={16} fill="currentColor" />{tx("开始训练", "Start training")}</button>
          </div>
        </div>
        <div className="career-personal-best">
          <small>{tx("标准训练最高分", "Standard-training high score")}</small>
          <strong>{standardBestScore ? formatNumber(standardBestScore) : "-"}</strong>
        </div>
      </section>

      <section className="career-metric-grid">
        <CareerMetric icon={CalendarDays} label={tx("训练局数", "Sessions")} value={formatNumber(overview.totalSessions)} />
        <CareerMetric icon={Clock3} label={tx("累计训练时长", "Total training time")} value={formatDuration(overview.totalDurationMs)} />
        <CareerMetric icon={Award} label={tx("标准训练平均分", "Average standard score")} value={standardSessions.length ? formatNumber(standardAverageScore) : "-"} />
        <CareerMetric icon={Crosshair} label={tx("标准训练平均击破数", "Average standard hits")} value={standardSessions.length ? formatNumber(standardAverageHits) : "-"} />
      </section>

      {performanceOverview}

      {aiAnalysisPanel}

      <section className="career-history-panel grid-shot-records">
        <header>
          <div><Clock3 size={18} /><h2>{tx("训练记录", "Training records")}</h2></div>
          <div className="career-history-actions">
            <span>{sessions.length} {tx("局", "sessions")}</span>
            <button type="button" onClick={onRefresh} aria-label={tx("刷新记录", "Refresh history")}><RefreshCw size={14} /></button>
          </div>
        </header>
        {loading && (
          <CareerDataStatus
            tone="loading"
            title={tx("正在同步训练记录", "Syncing training history")}
            message={sessions.length
              ? tx("当前记录仍可查看，云端更新完成后会自动刷新。", "Current sessions remain available and will refresh when the cloud update finishes.")
              : tx("正在从云端读取 Grid Shot 记录，请稍候。", "Loading Grid Shot sessions from the cloud.")}
            compact
          />
        )}
        {loadError && (
          <CareerDataStatus
            tone={sessions.length ? "warning" : "error"}
            title={sessions.length ? tx("训练记录未完全更新", "Training history is not fully updated") : tx("训练记录加载失败", "Training history failed to load")}
            message={loadError}
            actionLabel={tx("重新加载", "Try again")}
            onAction={onRefresh}
            compact
          />
        )}
        {sessions.length ? (
          <>
            <div className="career-session-list">
              <div className="career-session-head"><span>{tx("时间", "Date")}</span><span>{tx("得分", "Score")}</span><span>{tx("准确率", "Accuracy")}</span><span title={tx("Targets Per Minute，每分钟击破目标数", "Targets Per Minute")}>TPM</span><span>{tx("稳定性", "Stability")}</span><span>{tx("评级", "Grade")}</span><span /></div>
              {visibleSessions.map((session) => (
                <button type="button" className="career-session-row" data-integrity={session.integrityStatus.toLowerCase()} key={session.key} onClick={() => onOpenSession(session.key)}>
                  <span><time>{formatDate(session.completedAt)}</time><small>{session.sessionType === "benchmark" ? tx("标准训练", "Standard training") : tx("自由练习", "Free practice")} · {formatGridShotConfigurationLabel(session.configurationKey)} · {session.source === "cloud" ? tx("云端", "Cloud") : tx("本地", "Local")}</small></span>
                  <b>{formatNumber(session.score)}</b>
                  <span>{session.accuracy.toFixed(1)}%</span>
                  <span>{calculateGridShotTargetsPerMinute(session).toFixed(1)}</span>
                  <span>{Math.round(session.consistencyScore)}</span>
                  <em data-grade={session.grade}>{session.grade}</em>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            {historyPageCount > 1 && (
              <nav className="grid-shot-record-pagination" aria-label={tx("训练记录分页", "Training record pagination")}>
                <button
                  type="button"
                  className="grid-shot-page-arrow"
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}
                  aria-label={tx("上一页", "Previous page")}
                ><ChevronLeft size={16} /></button>
                <div>
                  {historyPaginationItems.map((item) => typeof item === "number" ? (
                    <button
                      type="button"
                      key={item}
                      className={item === historyPage ? "active" : undefined}
                      aria-current={item === historyPage ? "page" : undefined}
                      onClick={() => setHistoryPage(item)}
                    >{item + 1}</button>
                  ) : <span key={item} aria-hidden="true">…</span>)}
                </div>
                <button
                  type="button"
                  className="grid-shot-page-arrow"
                  disabled={historyPage >= historyPageCount - 1}
                  onClick={() => setHistoryPage((page) => Math.min(historyPageCount - 1, page + 1))}
                  aria-label={tx("下一页", "Next page")}
                ><ChevronRight size={16} /></button>
              </nav>
            )}
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
