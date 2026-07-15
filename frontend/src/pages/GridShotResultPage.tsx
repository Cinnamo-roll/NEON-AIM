import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  MessageCircle,
  RefreshCw,
  SendHorizontal,
  Settings2,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  TrainingAnalysisFinding,
  TrainingAnalysisResult,
  TrainingAnalysisTarget,
} from "../game/analysis/trainingAnalysis";
import { canUseGridShotAiAnalysis } from "../game/analysis/gridShotAiAccess";
import {
  getTrainingAiAnalysis,
  triggerTrainingAiAnalysis,
  type TrainingAiJob,
} from "../game/analysis/trainingAiAnalysisService";
import { TrainingSessionMetricGrid, TrainingSessionStatsCard } from "../components/training/TrainingSessionReviewData";
import { buildGridShotAnalysisBundle } from "../game/modes/gridShot/gridShotAnalysisSnapshot";
import { buildGridShotSessionReviewModel } from "../game/modes/gridShot/gridShotSessionReviewModel";
import {
  isGridShotBenchmarkSettings,
  type GridShotTargetSize,
} from "../game/modes/gridShot/gridShotConfig";
import { buildGridShotRuleAnalysis } from "../game/scoring/gridShotCoach";
import type { TrainingSessionSaveStatus } from "../game/storage/trainingSessionService";
import type { GridShotHistoryRecord } from "../game/types/training";
import { getAppLanguage, tx } from "../i18n";
import { useAuthStore } from "../features/auth/authStore";

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

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getAppLanguage(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const findingPriority: Record<TrainingAnalysisFinding["severity"], number> = {
  WARNING: 0,
  POSITIVE: 1,
  OPPORTUNITY: 2,
};

function findingLabel(severity: TrainingAnalysisFinding["severity"]) {
  if (severity === "WARNING") return tx("需要复核", "Needs review");
  if (severity === "OPPORTUNITY") return undefined;
  return tx("表现亮点", "Strength");
}

function AnalysisInsightSurface({
  analysis,
  actualValues,
  tone,
  sourceLabel,
  confidenceLabel,
  footer,
}: {
  analysis: TrainingAnalysisResult;
  actualValues: Record<string, number | undefined>;
  tone: "rules" | "ai";
  sourceLabel: string;
  confidenceLabel?: string;
  footer?: ReactNode;
}) {
  const findings = [...analysis.findings].sort((left, right) => findingPriority[left.severity] - findingPriority[right.severity]);
  const targets = analysis.nextAction.targets.map((target) => {
    const actual = actualValues[target.metric];
    const passed = actual === undefined
      ? undefined
      : target.operator === "AT_LEAST" ? actual >= target.value : actual <= target.value;
    return { target, actual, passed };
  });

  return (
    <section className="result-insight-surface" data-tone={tone}>
      <div className="result-insight-main">
        <header>
          <span>{tone === "ai" ? <BrainCircuit /> : <ListChecks />}{sourceLabel}</span>
          {confidenceLabel && <em>{confidenceLabel}</em>}
        </header>
        <h2>{analysis.headline}</h2>
        <p>{analysis.summary}</p>
        <div className="result-insight-priority">
          <span><Target /></span>
          <div className="result-insight-priority-copy">
            <small>{tx("建议", "Suggestion")}</small>
            <b>{analysis.nextAction.title}</b>
            <p>{analysis.nextAction.description}</p>
          </div>
          <div className="result-insight-targets">
            {targets.map(({ target, actual, passed }) => (
              <span key={target.metric} data-status={passed === undefined ? "unknown" : passed ? "passed" : "focus"}>
                <small>{target.label}{passed && <CheckCircle2 aria-label={tx("已达成", "Achieved")} />}</small>
                <b>{actual === undefined ? "—" : formatActualValue(actual, target.unit)}</b>
                <em>{tx("目标", "Target")} {targetValue(target)}</em>
              </span>
            ))}
          </div>
        </div>
      </div>
      <aside className="result-insight-evidence">
        <header><span>{tx("本局发现", "Session findings")}</span><em>{findings.length}</em></header>
        <div>
          {findings.map((finding) => {
            const label = findingLabel(finding.severity);
            return <article key={finding.code} data-severity={finding.severity}>
              {label && <small>{label}</small>}
              <h3>{finding.title}</h3>
              <p>{finding.evidence}</p>
            </article>;
          })}
        </div>
      </aside>
      {footer && <footer className="result-insight-footer">{footer}</footer>}
    </section>
  );
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
  const reviewModel = useMemo(
    () => record && bundle ? buildGridShotSessionReviewModel(record, bundle, bundle.targetSize) : undefined,
    [bundle, record],
  );
  const coach = bundle ? buildGridShotRuleAnalysis(bundle.aiSnapshot) : undefined;
  const [aiJob, setAiJob] = useState<TrainingAiJob>();
  const [aiError, setAiError] = useState("");
  const [activeReviewPanel, setActiveReviewPanel] = useState<"summary" | "ai">("summary");
  const resultSessionType = record?.sessionType ?? (record && isGridShotBenchmarkSettings({
    duration: record.duration,
    targetSize: bundle?.targetSize ?? targetSize,
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

  if (!record || !bundle || !coach || !reviewModel) {
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
  const aiConfidenceLabel = comparisonSampleSize >= 5
    ? tx(`参考最近 ${comparisonSampleSize} 局同配置`, `Compared with ${comparisonSampleSize} recent matching runs`)
    : comparisonSampleSize >= 2
      ? tx(`参考 ${comparisonSampleSize} 局同配置`, `Compared with ${comparisonSampleSize} matching runs`)
      : tx("仅分析本局", "This session only");
  const canGenerateAi = canUseGridShotAiAnalysis(authStatus, serverSessionId, aiPending);
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

  return (
    <main className="result-page result-page-detailed result-workbench result-workbench-v3 session-review-page" data-grade={reviewModel.grade}>
      <section className="result-command-deck result-workbench-deck session-review-shell">
        <nav className="result-review-topbar" aria-label={tx("复盘页面导航", "Review navigation")}>
          <button type="button" onClick={onTrainingHome}><ArrowLeft />{backLabel ? tx(...backLabel) : tx("返回训练列表", "Back to training list")}</button>
          {saveStatus === "login-required" && onLoginToSave && (
            <button type="button" className="result-review-save" onClick={onLoginToSave}><LogIn />{tx("前往登录", "Go to sign in")}</button>
          )}
        </nav>
        <section className="result-scoreboard result-scoreboard-v3">
          <header className="result-workbench-hero">
            <div className="result-workbench-title">
              <div>
                <h1 className="result-session-name" data-session-type={resultSessionType}>{reviewModel.projectLabel}</h1>
                <div className="result-session-meta">
                  <time dateTime={record.createdAt} aria-label={tx("训练时间", "Training time")}><CalendarClock />{formatSessionTime(record.createdAt)}</time>
                  <div className="result-session-meta-row">
                    <span className="result-benchmark-status" data-session-type={resultSessionType}>
                      {benchmarkResult ? <Target /> : <Settings2 />}
                      {benchmarkResult ? tx("基准训练", "Benchmark training") : tx("自定义训练", "Custom training")}
                    </span>
                    {!benchmarkResult && <span className="result-session-config">{reviewModel.kicker}</span>}
                    {saveStatus === "login-required" && <p className="result-save-status" data-state={saveStatus}>{tx("登录即可保存数据", "Sign in to save your data")}</p>}
                  </div>
                </div>
              </div>
            </div>
            <div className="result-workbench-score">
              <div><small>{tx("本局得分", "Session score")}</small><strong>{reviewModel.score.toLocaleString()}</strong></div>
              <span><small>{tx("评级", "Grade")}</small><b aria-label={tx(`评级 ${reviewModel.grade}`, `Grade ${reviewModel.grade}`)}>{reviewModel.grade}</b></span>
            </div>
          </header>
          {saveStatus === "failed" && (
            <div className="result-save-gate" data-state={saveStatus}>
              <span>{isAuthenticated ? <RefreshCw /> : <LogIn />}</span>
              <div>
                <b>{isAuthenticated ? tx("这局还没有保存到云端", "This session has not reached the cloud") : tx("这局还没有保存", "This session has not been saved")}</b>
                <small>{isAuthenticated ? tx("检查网络后重新保存。", "Check your connection and save again.") : tx("登录即可保存数据", "Sign in to save your data")}</small>
              </div>
              {!isAuthenticated && onLoginToSave && <button type="button" onClick={onLoginToSave}>{tx("前往登录", "Go to sign in")}<LogIn /></button>}
              {isAuthenticated && onRetrySave && <button type="button" onClick={onRetrySave}>{tx("重试保存", "Retry save")}<RefreshCw /></button>}
            </div>
          )}
          <TrainingSessionMetricGrid metrics={reviewModel.metrics} />
        </section>

        <section className="result-review-workspace">
          <section className="result-review-switcher" data-active-panel={activeReviewPanel}>
            <header className="result-review-switcher-header">
              <div className="result-review-tabs" role="tablist" aria-label={tx("切换分析方式", "Switch analysis mode")}>
                <button
                  id="result-summary-tab"
                  type="button"
                  role="tab"
                  aria-selected={activeReviewPanel === "summary"}
                  aria-controls="result-summary-panel"
                  onClick={() => setActiveReviewPanel("summary")}
                ><ListChecks />{tx("系统分析", "System analysis")}</button>
                <button
                  id="result-ai-tab"
                  type="button"
                  role="tab"
                  aria-selected={activeReviewPanel === "ai"}
                  aria-controls="result-ai-panel"
                  onClick={() => setActiveReviewPanel("ai")}
                >{aiPending ? <LoaderCircle className="spin" /> : <BrainCircuit />}{tx("AI 深度分析", "AI deep analysis")}</button>
              </div>
            </header>

            <div className="result-review-switcher-body">
              <div
                id="result-summary-panel"
                className="result-review-panel result-review-summary-panel"
                role="tabpanel"
                aria-labelledby="result-summary-tab"
                hidden={activeReviewPanel !== "summary"}
              >
                <AnalysisInsightSurface
                  analysis={coach}
                  actualValues={reviewModel.targetActualValues}
                  tone="rules"
                  sourceLabel={tx("本局结论", "Session conclusion")}
                />
              </div>

              <div
                id="result-ai-panel"
                className="result-review-panel result-review-ai-panel"
                role="tabpanel"
                aria-labelledby="result-ai-tab"
                hidden={activeReviewPanel !== "ai"}
              >
                {aiAnalysis ? (
                  <AnalysisInsightSurface
                    analysis={aiAnalysis}
                    actualValues={reviewModel.targetActualValues}
                    tone="ai"
                    sourceLabel={tx("AI 教练分析", "AI coach analysis")}
                    confidenceLabel={aiConfidenceLabel}
                    footer={<>
                      <small>{aiJob?.cacheHit ? tx("已复用本局现有分析", "Reused this session's existing analysis") : tx(`${(aiJob?.inputTokens ?? 0) + (aiJob?.outputTokens ?? 0)} Token · ${aiJob?.model ?? "AI"}`, `${(aiJob?.inputTokens ?? 0) + (aiJob?.outputTokens ?? 0)} tokens · ${aiJob?.model ?? "AI"}`)}</small>
                      <div className="result-insight-actions">
                        {isAdmin && aiError && onOpenSettings && <button type="button" className="secondary" onClick={onOpenSettings}><Settings2 />{tx("检查 AI 配置", "Check AI settings")}</button>}
                        <button type="button" disabled={!canGenerateAi} onClick={() => void triggerAi()}>{aiPending ? <LoaderCircle className="spin" /> : <Sparkles />}{tx("重新分析", "Analyze again")}</button>
                      </div>
                    </>}
                  />
                ) : (
                  <section className={`result-insight-surface result-insight-empty ${aiPending ? "" : "result-insight-empty-idle"}`} data-tone="ai" data-state={!isAuthenticated ? "LOGIN_REQUIRED" : aiJob?.status ?? "NOT_REQUESTED"}>
                    <div className="result-insight-main">
                      <header><span><BrainCircuit />{tx("AI 教练分析", "AI coach analysis")}</span></header>
                      <h2>{!isAuthenticated
                        ? tx("等待用户登录", "Waiting for sign-in")
                        : aiPending
                          ? tx("正在梳理这局的关键变化", "Finding the key changes in this session")
                          : aiJob?.status === "FAILED" || aiJob?.status === "BUDGET_EXHAUSTED"
                            ? tx("这次分析没有完成", "The analysis could not be completed")
                            : tx("让 AI 深挖这局的关键变化", "Let AI dig into this session")}</h2>
                      <p>{!isAuthenticated
                        ? tx("登录后即可保存本局，并使用 AI 深度分析。", "Sign in to save this session and use AI deep analysis.")
                        : aiPending
                          ? tx("正在核对本局表现与近期同配置记录，完成后会直接给出结论和唯一行动重点。", "Comparing this session with recent matching records, then producing one conclusion and one action focus.")
                          : aiJob?.failureMessage || aiError || (!serverSessionId
                              ? tx("本局保存完成后即可开始分析。", "Analysis becomes available after this session is saved.")
                              : tx("AI 会补充系统分析没有覆盖的细节，并参考最近 5 局同配置训练。", "AI adds details beyond system analysis and references the five most recent matching sessions."))}</p>
                    </div>
                    {aiPending && (
                      <aside className="result-insight-evidence result-ai-processing-state">
                        <header><span>{tx("分析进度", "Analysis progress")}</span><em>2/3</em></header>
                        <div className="result-ai-analysis-steps">
                          <span data-state="complete"><CheckCircle2 /><span><b>{tx("校验本局数据", "Validate session data")}</b><small>{tx("已完成", "Complete")}</small></span></span>
                          <span data-state="active"><LoaderCircle className="spin" /><span><b>{tx("对比近期表现", "Compare recent performance")}</b><small>{tx("进行中", "In progress")}</small></span></span>
                          <span data-state="pending"><Sparkles /><span><b>{tx("生成训练重点", "Create training focus")}</b><small>{tx("等待处理", "Waiting")}</small></span></span>
                        </div>
                      </aside>
                    )}
                    <footer className="result-insight-footer">
                      {!isAuthenticated
                        ? <button type="button" disabled={!onLoginToSave} onClick={onLoginToSave}><LogIn />{tx("前往登录", "Go to sign in")}</button>
                        : aiPending
                          ? <div className="result-ai-processing-footer"><span><i />{tx("AI 分析进行中", "AI analysis in progress")}</span><small>{tx("可以先查看系统分析，完成后这里会自动更新", "You can view System analysis while this updates automatically")}</small></div>
                        : <div className="result-insight-actions">
                            {isAdmin && aiError && onOpenSettings && <button type="button" className="secondary" onClick={onOpenSettings}><Settings2 />{tx("检查 AI 配置", "Check AI settings")}</button>}
                            <button type="button" disabled={!canGenerateAi} onClick={() => void triggerAi()}><Sparkles />{!serverSessionId ? tx("等待本局保存", "Waiting for save") : tx("开始 AI 分析", "Start AI analysis")}</button>
                          </div>}
                    </footer>
                  </section>
                )}
              </div>
            </div>
          </section>

          <aside className="result-ai-chat-preview" aria-label={tx("AI 对话，待开发", "AI chat, coming soon")}>
            <header>
              <span><MessageCircle /></span>
              <div><b>{tx("AI 对话", "AI chat")}</b><em>{tx("待开发", "Coming soon")}</em></div>
            </header>
            <div>
              <small>{tx("延续本局上下文", "Continue this session")}</small>
              <h2>{tx("基于这局继续问", "Keep asking about this run")}</h2>
              <p>{tx("未来可以直接追问失误原因、节奏变化和下一局练法。", "Ask directly about mistakes, rhythm changes, and what to try next.")}</p>
              <div className="result-ai-chat-prompts" aria-hidden="true">
                <span>{tx("我最该先改什么？", "What should I fix first?")}</span>
                <span>{tx("下一局怎么练？", "How should I train next?")}</span>
              </div>
            </div>
            <footer>
              <span><LockKeyhole />{tx("在这里继续追问本局表现", "Continue asking about this session")}</span>
              <button type="button" disabled aria-label={tx("发送，待开发", "Send, coming soon")}><SendHorizontal /></button>
            </footer>
          </aside>
        </section>

        <TrainingSessionStatsCard model={reviewModel} />

      </section>
    </main>
  );
}
