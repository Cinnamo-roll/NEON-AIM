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
import {
  cloudGridShotCareerDetail,
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
import { formatGridShotConfigurationLabel } from "../../../../game/modes/gridShot/gridShotConfigurationLabel";
import { getTrainingSessionDetail, listAllTrainingSessions } from "../../../../game/storage/trainingSessionService";
import { GridShotCareerProfile } from "./GridShotCareerProfile";
import { GridShotCareerSessionReview } from "./GridShotCareerSessionReview";
import type { GridShotCareerProjectData } from "./gridShotCareerProjectData";

export const gridShotCareerProjectDefinition: CareerProjectDefinition = {
  id: "grid-shot",
  engineId: "clicking",
  difficulty: "foundation",
  name: ["GRID SHOT", "GRID SHOT"],
  eyebrow: ["点击定位", "CLICKING"],
  description: [
    "汇总有效训练记录，观察准确率、切换节奏与后程控制。",
    "Use valid sessions to track accuracy, switching pace, and late-run control.",
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
  return tx("等待有效记录", "Awaiting valid sessions");
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

function comparableSessions(sessions: readonly GridShotCareerSession[]) {
  const groups = new Map<string, GridShotCareerSession[]>();
  sessions.filter((session) => session.integrityStatus === "VALID").forEach((session) => {
    const key = `${session.configurationKey}:${session.modeVersion}:${session.scoringVersion}`;
    const group = groups.get(key) ?? [];
    group.push(session);
    groups.set(key, group);
  });
  let selected: GridShotCareerSession[] = [];
  groups.forEach((group) => {
    if (group.length > selected.length) selected = group;
  });
  return selected;
}

function projectInsight(overview: ReturnType<typeof summarizeGridShotCareer>) {
  if (!overview.validSessions) return {
    eyebrow: tx("系统分析", "SYSTEM ANALYSIS"),
    title: tx("等待有效训练数据", "Waiting for valid training data"),
    description: tx("完成训练后，系统会从表现与阶段数据中生成当前解读。", "Complete a session to generate a readout from performance and phase data."),
  };
  if (overview.recentScoreDeltaPercent !== null && overview.recentScoreDeltaPercent > 2) return {
    eyebrow: tx("系统分析", "SYSTEM ANALYSIS"),
    title: tx("近期训练表现正在提升", "Recent performance is improving"),
    description: tx("项目档案会继续观察准确率、命中速度与稳定度是否同步保持。", "The profile will keep checking whether accuracy, pace, and consistency hold together."),
  };
  if (overview.recentScoreDeltaPercent !== null && overview.recentScoreDeltaPercent < -2) return {
    eyebrow: tx("系统分析", "SYSTEM ANALYSIS"),
    title: tx("近期表现出现回落", "Recent performance has declined"),
    description: tx("进入项目档案查看具体变化，建议只针对最明显的一项调整。", "Open the project profile for the specific change and adjust only the clearest issue."),
  };
  return {
    eyebrow: tx("系统分析", "SYSTEM ANALYSIS"),
    title: tx("当前表现整体稳定", "Current performance is stable"),
    description: tx("暂未发现明显变化，项目档案会继续积累同配置记录并更新判断。", "No major change is evident; the profile will keep updating from comparable sessions."),
  };
}

function contribution(dataset: CareerProjectDataset): CareerProjectContribution {
  const projectData = data(dataset);
  const sessions = projectData.sessions;
  const allOverview = summarizeGridShotCareer(sessions);
  const cohortOverview = summarizeGridShotCareer(comparableSessions(sessions));
  const trend = cohortOverview.recentScoreDeltaPercent === null
    ? "observing"
    : cohortOverview.recentScoreDeltaPercent > 2 ? "improving" : cohortOverview.recentScoreDeltaPercent < -2 ? "declining" : "stable";
  return {
    project: {
      definition: gridShotCareerProjectDefinition,
      statusLabel: projectData.profile
        ? profileConfidenceLabel(projectData.profile.sample.confidence)
        : tx("数据观察中", "Collecting data"),
      sessionCount: sessions.length,
      summary: allOverview.validSessions
        ? tx(
          `平均准确率 ${allOverview.averageAccuracy.toFixed(1)}% · ${allOverview.averageTargetsPerMinute.toFixed(1)} TPM`,
          `${allOverview.averageAccuracy.toFixed(1)}% average accuracy · ${allOverview.averageTargetsPerMinute.toFixed(1)} TPM`,
        )
        : tx("等待第一局有效训练记录", "Awaiting the first valid session"),
      trend,
      coreMetrics: allOverview.validSessions ? [
        { code: "accuracy", label: tx("平均准确率", "Average accuracy"), value: `${allOverview.averageAccuracy.toFixed(1)}%` },
        { code: "targetsPerMinute", label: tx("平均目标速度", "Average target pace"), value: `${allOverview.averageTargetsPerMinute.toFixed(1)} TPM` },
        { code: "consistencyScore", label: tx("平均节奏稳定", "Average rhythm stability"), value: `${allOverview.averageConsistencyScore.toFixed(0)} / 100` },
      ] : [],
    },
    updatedAt: sessions[0]?.completedAt ?? null,
    totalSessions: sessions.length,
    totalDurationMs: allOverview.totalDurationMs,
    activity: sessions.map((session) => ({
      completedAt: session.completedAt,
      durationMs: session.durationMs,
    })),
    abilities: abilities(projectData.profile),
    recentSessions: sessions.map((session) => ({
      id: session.key,
      projectId: session.projectId,
      trainingId: session.trainingId,
      projectName: "GRID SHOT",
      completedAt: session.completedAt,
      durationMs: session.durationMs,
      sessionType: session.sessionType,
      context: formatGridShotConfigurationLabel(session.configurationKey),
      primaryLabel: tx("得分", "Score"),
      primaryValue: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(session.score)),
      secondaryLabel: tx("准确率", "Accuracy"),
      secondaryValue: `${session.accuracy.toFixed(1)}%`,
      grade: session.grade,
    })),
    trend: cohortOverview.trend.map((point) => ({
      order: point.order,
      completedAt: point.completedAt,
      primary: point.scorePerMinute,
      secondary: point.accuracy,
    })),
    trendLabels: {
      primary: tx("每分钟得分", "Score / min"),
      secondary: tx("准确率", "Accuracy"),
    },
    insight: projectInsight(cohortOverview),
  };
}

function localDataset(): CareerProjectDataset {
  const projectData: GridShotCareerProjectData = {
    sessions: [],
    profile: null,
    notice: null,
  };
  return { sessions: projectData.sessions, payload: projectData, notice: null };
}

async function remoteDataset(local: CareerProjectDataset, context: CareerProjectLoadContext) {
  if (!context.authenticated) return local;
  const localData = data(local);
  const [cloudResult, profileResult] = await Promise.allSettled([
    listAllTrainingSessions("grid-shot"),
    getTrainingCareerProfile("grid-shot"),
  ]);
  const notices: string[] = [];
  if (cloudResult.status === "rejected") {
    notices.push(tx(
      "云端训练记录加载失败，当前显示已保存的数据。请检查网络连接与后端服务后重试。",
      "Cloud training history failed to load. Saved data is shown instead. Check the network and backend service, then try again.",
    ));
  }
  if (profileResult.status === "rejected") {
    notices.push(tx(
      "能力档案暂时无法更新，本次训练统计可能不是最新。请稍后重试。",
      "The capability profile could not be updated, so these statistics may be stale. Please try again.",
    ));
  }
  const notice = notices.join(" ") || null;
  const projectData: GridShotCareerProjectData = {
    sessions: cloudResult.status === "fulfilled"
      ? mergeGridShotCareerSessions(cloudResult.value, [])
      : localData.sessions,
    profile: profileResult.status === "fulfilled" ? profileResult.value : localData.profile,
    notice,
  };
  return { sessions: projectData.sessions, payload: projectData, notice };
}

export const gridShotCareerModule: CareerProjectModule = {
  definition: gridShotCareerProjectDefinition,
  trainingEntries: [
    { id: "benchmark", label: ["标准训练", "Standard training"] },
    { id: "practice", label: ["自由练习", "Free practice"] },
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
      onBack={props.onBack}
      onRefresh={props.onRefresh}
      onOpenSession={props.onOpenSession}
      onBrowseTraining={props.onBrowseTraining}
    />
  ),
  prepareSessionReview: (session, dataset, settings): CareerSessionReviewRequest => {
    const gridSession = data(dataset).sessions.find((candidate) => candidate.key === session.key);
    if (!gridSession) {
      return {
        initialDetail: null,
        missingDetailMessage: tx("找不到这条 Grid Shot 记录。", "This Grid Shot session is unavailable."),
        remoteErrorMessage: tx(
          "找不到这局训练的详情，记录可能已经被删除。请返回后选择其他记录。",
          "This session detail could not be found and may have been deleted. Go back and choose another session.",
        ),
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
      remoteErrorMessage: tx(
        "这局训练的云端详情加载失败。请检查网络连接与后端服务后重试。",
        "This session's cloud detail failed to load. Check the network and backend service, then try again.",
      ),
    };
  },
  renderSessionReview: (props) => (
    <GridShotCareerSessionReview
      session={props.session as GridShotCareerSession}
      detail={props.detail as GridShotCareerDetail | null}
      loading={props.loading}
      error={props.error}
      backLabel={props.backLabel}
      onBack={props.onBack}
      onRetry={props.onRetry}
    />
  ),
};

export function isGridShotCareerSession(session: CareerProjectSession): session is GridShotCareerSession {
  return session.projectId === "grid-shot" && session.trainingId === "grid-shot";
}
