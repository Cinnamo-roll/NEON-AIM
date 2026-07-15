import type { CareerProjectDefinition } from "../../careerProjectDefinition";
import type {
  CareerCapabilityEvidence,
  CareerProjectContribution,
  CareerProjectDataset,
  CareerProjectLoadContext,
  CareerProjectModule,
  CareerProjectSession,
  CareerSessionReviewRequest,
} from "../../careerProjectModule";
import { tx } from "../../../../i18n";
import { getTrainingCoachingTask, type TrainingCoachingTask } from "../../../../game/analysis/trainingCoachingTaskService";
import {
  cloudGridShotCareerDetail,
  isGridShotBenchmarkSession,
  localGridShotCareerDetail,
  mergeGridShotCareerSessions,
  summarizeGridShotCareer,
  type GridShotCareerDetail,
  type GridShotCareerSession,
} from "../../../../game/career/gridShotCareer";
import {
  getTrainingCareerProfile,
  type TrainingCareerMetricProfile,
  type TrainingCareerProfile,
  type TrainingCareerProfileConfidence,
} from "../../../../game/career/trainingCareerProfileService";
import type { GridShotTargetSize } from "../../../../game/modes/gridShot/gridShotConfig";
import { getTrainingSessionDetail, listAllTrainingSessions } from "../../../../game/storage/trainingSessionService";
import { GridShotCareerProfile } from "./GridShotCareerProfile";
import { GridShotCareerSessionReview } from "./GridShotCareerSessionReview";
import type { GridShotCareerProjectData } from "./gridShotCareerProjectData";

export const gridShotCareerProjectDefinition: CareerProjectDefinition = {
  id: "grid-shot",
  engineId: "clicking",
  name: ["GRID SHOT", "GRID SHOT"],
  eyebrow: ["点击定位", "CLICKING"],
  description: [
    "建立可比较的点击定位基线，观察准确率、切换节奏与后程控制。",
    "Build a comparable clicking baseline across accuracy, switching pace, and late-run control.",
  ],
  capabilities: [
    { code: "click-precision", label: ["点击精准", "Click precision"], weight: 0.35 },
    { code: "target-switching", label: ["目标切换", "Target switching"], weight: 0.25 },
    { code: "rhythm-control", label: ["节奏稳定", "Rhythm control"], weight: 0.2 },
    { code: "sustained-control", label: ["持续控制", "Sustained control"], weight: 0.2 },
  ],
  metrics: [
    { code: "accuracy", label: ["准确率", "Accuracy"], unit: "%", direction: "higher-is-better" },
    { code: "targetsPerMinute", label: ["目标切换", "Target pace"], unit: "TPM", direction: "higher-is-better" },
    { code: "averageHitInterval", label: ["平均命中间隔", "Average hit interval"], unit: "ms", direction: "lower-is-better" },
    { code: "consistencyScore", label: ["节奏稳定", "Rhythm stability"], unit: "pts", direction: "higher-is-better" },
  ],
  benchmark: {
    configurationKey: "grid-shot:60s:medium",
    minimumSamples: 3,
    stableSamples: 10,
  },
};

const profileDimensionByCapability = {
  "click-precision": "CLICK_PRECISION",
  "target-switching": "TARGET_SWITCHING",
  "rhythm-control": "RHYTHM_STABILITY",
  "sustained-control": "SUSTAINED_CONTROL",
} as const;

function data(dataset: CareerProjectDataset): GridShotCareerProjectData {
  return dataset.payload as GridShotCareerProjectData;
}

function targetSize(settings: unknown): GridShotTargetSize {
  if (settings && typeof settings === "object") {
    const value = (settings as { targetSize?: unknown }).targetSize;
    if (value === "small" || value === "large") return value;
  }
  return "medium";
}

function profileConfidenceLabel(confidence: TrainingCareerProfileConfidence) {
  if (confidence === "STABLE") return tx("稳定档案", "Stable profile");
  if (confidence === "DEVELOPING") return tx("成长档案", "Developing profile");
  if (confidence === "INITIAL") return tx("初步档案", "Initial profile");
  if (confidence === "OBSERVING") return tx("数据观察中", "Collecting data");
  return tx("等待基准记录", "Awaiting benchmark");
}

function confidenceWeight(confidence: TrainingCareerProfileConfidence | undefined) {
  if (confidence === "STABLE") return 1;
  if (confidence === "DEVELOPING") return 0.75;
  if (confidence === "INITIAL") return 0.5;
  if (confidence === "OBSERVING") return 0.25;
  return 0;
}

function formatMetric(metric: TrainingCareerMetricProfile | undefined) {
  const value = metric?.current;
  if (!metric || value === null || value === undefined) return "-";
  if (metric.unit === "%") return `${value.toFixed(1)}%`;
  if (metric.unit === "TPM") return `${value.toFixed(1)} TPM`;
  if (metric.unit === "ms") return `${Math.round(value)}ms`;
  if (metric.unit === "分") return `${Math.round(value)} / 100`;
  return `${value.toFixed(1)} ${metric.unit}`;
}

function evidenceTrend(metric: TrainingCareerMetricProfile | undefined) {
  if (!metric || metric.trend === "INSUFFICIENT") return "observing" as const;
  if (metric.trend === "IMPROVING") return "improving" as const;
  if (metric.trend === "DECLINING") return "declining" as const;
  return "stable" as const;
}

function evidenceNote(metric: TrainingCareerMetricProfile | undefined) {
  if (!metric || metric.delta === null) return tx("观察中 / 数据不足", "Observing / insufficient data");
  const delta = `${metric.delta >= 0 ? "+" : ""}${metric.delta.toFixed(metric.unit === "ms" ? 0 : 1)}${metric.unit === "%" ? tx(" 个百分点", " pp") : ` ${metric.unit}`}`;
  if (metric.trend === "IMPROVING") return tx(`近 3 局提升 ${delta}`, `Last three improved ${delta}`);
  if (metric.trend === "DECLINING") return tx(`近 3 局回落 ${delta}`, `Last three declined ${delta}`);
  return tx(`近 3 局基本稳定 ${delta}`, `Last three stable ${delta}`);
}

function abilities(profile: TrainingCareerProfile | null): CareerCapabilityEvidence[] {
  return gridShotCareerProjectDefinition.capabilities.map((capability) => {
    const dimensionCode = profileDimensionByCapability[capability.code as keyof typeof profileDimensionByCapability];
    const dimension = profile?.dimensions.find((candidate) => candidate.code === dimensionCode);
    const primary = dimension?.metrics.find((metric) => metric.code === dimension.primaryMetric);
    const observed = primary?.current !== null && primary?.current !== undefined;
    const canNormalize = primary?.unit === "%" || primary?.unit === "分";
    return {
      code: capability.code,
      label: tx(...capability.label),
      observed,
      value: formatMetric(primary),
      note: evidenceNote(primary),
      trend: evidenceTrend(primary),
      confidence: confidenceWeight(profile?.sample.confidence),
      ...(observed && canNormalize ? { normalizedScore: Math.max(0, Math.min(100, primary.current ?? 0)) } : {}),
    };
  });
}

function overviewGoal(
  benchmarkValidSessions: number,
  coachingTask: TrainingCoachingTask | null,
) {
  const activeTask = coachingTask?.status === "ACTIVE" ? coachingTask : null;
  if (activeTask) {
    return {
      eyebrow: tx("当前训练目标", "CURRENT TRAINING GOAL"),
      title: activeTask.title,
      description: activeTask.description,
      completed: activeTask.progress.attemptsCompleted,
      total: activeTask.progress.maxAttempts,
      projectId: "grid-shot",
      entryId: "benchmark",
      actionLabel: tx("继续目标训练", "Continue goal"),
    };
  }
  const nextMilestone = benchmarkValidSessions < 3 ? 3 : benchmarkValidSessions < 5 ? 5 : 10;
  const remaining = Math.max(0, nextMilestone - benchmarkValidSessions);
  const baseline = benchmarkValidSessions < 3
    ? { completed: benchmarkValidSessions, total: 3, title: tx("建立第一份 Grid Shot 基线", "Establish your first Grid Shot baseline"), description: tx("完成三局固定配置训练，生涯才能开始判断趋势。", "Complete three fixed-configuration runs so career can begin judging trends.") }
    : benchmarkValidSessions < 10
      ? { completed: benchmarkValidSessions, total: nextMilestone, title: tx("把初步档案练成稳定基线", "Turn the early profile into a stable baseline"), description: tx(`再完成 ${remaining} 局基准训练，提升档案可信度。`, `Complete ${remaining} more benchmark runs to improve profile confidence.`) }
      : { completed: 10, total: 10, title: tx("稳定基线已经建立", "Stable baseline established"), description: tx("继续训练以观察长期变化，或进入项目档案查看具体指标。", "Keep training to reveal long-term change, or open the project profile for detailed metrics.") };
  return {
    eyebrow: tx("当前训练目标", "CURRENT TRAINING GOAL"),
    ...baseline,
    projectId: "grid-shot",
    entryId: "benchmark",
    actionLabel: tx("开始基准训练", "Start benchmark"),
  };
}

function contribution(dataset: CareerProjectDataset): CareerProjectContribution {
  const projectData = data(dataset);
  const sessions = projectData.sessions;
  const benchmark = sessions.filter(isGridShotBenchmarkSession);
  const allOverview = summarizeGridShotCareer(sessions);
  const benchmarkOverview = summarizeGridShotCareer(benchmark);
  const goal = overviewGoal(benchmarkOverview.validSessions, projectData.coachingTask);
  const trend = benchmarkOverview.recentScoreDeltaPercent === null
    ? "observing"
    : benchmarkOverview.recentScoreDeltaPercent > 2 ? "improving" : benchmarkOverview.recentScoreDeltaPercent < -2 ? "declining" : "stable";
  return {
    project: {
      definition: gridShotCareerProjectDefinition,
      statusLabel: projectData.profile
        ? profileConfidenceLabel(projectData.profile.sample.confidence)
        : tx("数据观察中", "Collecting data"),
      sessionCount: sessions.length,
      benchmarkCount: benchmark.length,
      summary: allOverview.validSessions
        ? tx(
          `平均准确率 ${allOverview.averageAccuracy.toFixed(1)}% · ${allOverview.averageTargetsPerMinute.toFixed(1)} TPM`,
          `${allOverview.averageAccuracy.toFixed(1)}% average accuracy · ${allOverview.averageTargetsPerMinute.toFixed(1)} TPM`,
        )
        : tx("等待第一局有效训练记录", "Awaiting the first valid session"),
      trend,
    },
    updatedAt: sessions[0]?.completedAt ?? null,
    totalSessions: sessions.length,
    totalDurationMs: allOverview.totalDurationMs,
    benchmarkSessions: benchmark.length,
    practiceSessions: sessions.length - benchmark.length,
    activity: sessions.map((session) => ({
      completedAt: session.completedAt,
      durationMs: session.durationMs,
      sessionType: session.sessionType,
    })),
    abilities: abilities(projectData.profile),
    recentSessions: sessions.slice(0, 8).map((session) => ({
      id: session.key,
      projectId: session.projectId,
      trainingId: session.trainingId,
      projectName: "GRID SHOT",
      completedAt: session.completedAt,
      durationMs: session.durationMs,
      sessionType: session.sessionType,
      context: `${isGridShotBenchmarkSession(session) ? tx("基准", "Benchmark") : tx("自由训练", "Practice")} · ${Math.round(session.durationMs / 1_000)}s`,
      primaryValue: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(session.score)),
      secondaryValue: `${session.accuracy.toFixed(1)}%`,
      grade: session.grade,
    })),
    trend: benchmarkOverview.trend.map((point) => ({
      order: point.order,
      completedAt: point.completedAt,
      primary: point.scorePerMinute,
      secondary: point.accuracy,
    })),
    goal,
    recommendation: {
      title: goal.title,
      description: goal.description,
      actionLabel: goal.actionLabel,
    },
  };
}

function localDataset(): CareerProjectDataset {
  const projectData: GridShotCareerProjectData = {
    sessions: [],
    profile: null,
    coachingTask: null,
    notice: null,
  };
  return { sessions: projectData.sessions, payload: projectData, notice: null };
}

async function remoteDataset(local: CareerProjectDataset, context: CareerProjectLoadContext) {
  if (!context.authenticated) return local;
  const localData = data(local);
  const [cloudResult, profileResult, coachingResult] = await Promise.allSettled([
    listAllTrainingSessions("grid-shot"),
    getTrainingCareerProfile("grid-shot"),
    context.isAdmin ? getTrainingCoachingTask("grid-shot") : Promise.resolve(null),
  ]);
  const notice = cloudResult.status === "rejected"
    ? tx("云端记录暂时无法读取，请稍后重试。", "Cloud history is unavailable. Please try again later.")
    : null;
  const projectData: GridShotCareerProjectData = {
    sessions: cloudResult.status === "fulfilled"
      ? mergeGridShotCareerSessions(cloudResult.value, [])
      : localData.sessions,
    profile: profileResult.status === "fulfilled" ? profileResult.value : null,
    coachingTask: coachingResult.status === "fulfilled" ? coachingResult.value : null,
    notice,
  };
  return { sessions: projectData.sessions, payload: projectData, notice };
}

export const gridShotCareerModule: CareerProjectModule = {
  definition: gridShotCareerProjectDefinition,
  trainingEntries: [
    { id: "benchmark", label: ["基准训练", "Benchmark"] },
    { id: "practice", label: ["自由练习", "Practice"] },
  ],
  loadLocal: () => localDataset(),
  loadRemote: remoteDataset,
  isBenchmarkSession: (session) => session.sessionType === "benchmark",
  buildContribution: contribution,
  renderProfile: (props) => (
    <GridShotCareerProfile
      data={data(props.dataset)}
      loading={props.loading}
      authenticated={props.authenticated}
      isAdmin={props.isAdmin}
      onBack={props.onBack}
      onRefresh={props.onRefresh}
      onOpenSession={props.onOpenSession}
      onStartTraining={props.onStartTraining}
      onBrowseTraining={props.onBrowseTraining}
    />
  ),
  prepareSessionReview: (session, dataset, settings): CareerSessionReviewRequest => {
    const gridSession = data(dataset).sessions.find((candidate) => candidate.key === session.key);
    if (!gridSession) {
      return {
        initialDetail: null,
        missingDetailMessage: tx("找不到这条 Grid Shot 记录。", "This Grid Shot session is unavailable."),
        remoteErrorMessage: tx("无法读取这局训练的云端详情。", "Unable to load this session detail."),
      };
    }
    const initialDetail = localGridShotCareerDetail(gridSession, targetSize(settings));
    return {
      initialDetail,
      ...(gridSession.source === "cloud" && gridSession.serverId ? {
        remoteDetail: getTrainingSessionDetail<
          Record<string, string | number>,
          { segments: GridShotCareerDetail["segments"]; events: GridShotCareerDetail["events"] },
          GridShotCareerDetail["analysisSnapshot"]
        >(gridSession.serverId).then((response) => cloudGridShotCareerDetail(gridSession, response)),
      } : {}),
      missingDetailMessage: tx("这条本地记录缺少详细事件。", "This local session has no event detail."),
      remoteErrorMessage: tx("无法读取这局训练的云端详情。", "Unable to load this session detail."),
    };
  },
  renderSessionReview: (props) => (
    <GridShotCareerSessionReview
      session={props.session as GridShotCareerSession}
      detail={props.detail as GridShotCareerDetail | null}
      loading={props.loading}
      error={props.error}
      onBack={props.onBack}
    />
  ),
};

export function isGridShotCareerSession(session: CareerProjectSession): session is GridShotCareerSession {
  return session.projectId === "grid-shot" && session.trainingId === "grid-shot";
}
