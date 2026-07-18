import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  History,
  Layers3,
  LogIn,
  Route,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../features/auth/authStore";
import { CareerGamePlan } from "../features/career/CareerGamePlan";
import { CareerOverview } from "../features/career/CareerOverview";
import { CareerDataStatus } from "../features/career/CareerDataStatus";
import { aggregateCareerOverview } from "../features/career/careerOverviewAggregation";
import {
  CareerPageCarousel,
  type CareerPageDirection,
  type CareerPrimaryView,
} from "../features/career/CareerPageCarousel";
import {
  careerActiveProjectStorageKey,
  careerPrimaryViewStorageKey,
  readCareerActiveProject,
  readCareerPrimaryView,
} from "../features/career/careerPrimaryViewStorage";
import { CareerProjectDirectory } from "../features/career/CareerProjectDirectory";
import {
  readCareerProjectDatasetCache,
  writeCareerProjectDatasetCache,
} from "../features/career/careerProjectDatasetCache";
import type {
  CareerProjectDataset,
  CareerProjectLoadContext,
  CareerProjectSession,
} from "../features/career/careerProjectModule";
import {
  getCareerProjectModule,
  listCareerProjectModules,
} from "../features/career/careerProjectRegistry";
import { listPendingGuestTrainingSessions } from "../game/storage/pendingGuestTrainingSessions";
import type { TrainingSessionSubmission } from "../game/storage/trainingSessionService";
import { formatSeconds, getAppLanguage, tx } from "../i18n";
import "./careerPage.css";

interface CareerPageProps {
  projectSettings?: Readonly<Record<string, unknown>>;
  onStartTraining: (projectId: string, entryId: string) => void;
  onBrowseTraining: () => void;
  onLogin: () => void;
}

interface SelectedSession {
  projectId: string;
  sessionKey: string;
  origin: "overview" | "project";
}

const CAREER_GUEST_DATA_ROWS = [
  [["训练记录流", "SESSION STREAM"], ["训练记录", "TRAINING RECORD"], ["项目档案", "PROJECT PROFILE"], ["能力数据", "CAPABILITY DATA"]],
  [["准确率", "ACCURACY"], ["速度", "SPEED"], ["稳定性", "STABILITY"], ["控制", "CONTROL"]],
  [["AI 分析", "AI ANALYSIS"], ["趋势数据", "TREND DATA"], ["训练重点", "TRAINING FOCUS"], ["可信度", "CONFIDENCE"]],
  [["游戏目标", "GAME GOAL"], ["训练计划", "TRAINING PLAN"], ["复盘记录", "SESSION REVIEW"], ["训练进度", "PROGRESS"]],
] as const;

function ProjectUnavailable({
  onBack,
  backLabel = ["返回训练项目", "Back to projects"],
}: {
  onBack: () => void;
  backLabel?: readonly [zh: string, en: string];
}) {
  return (
    <main className="workspace-main career-page career-detail-page">
      <header className="career-detail-header">
        <button type="button" onClick={onBack}><ArrowLeft size={16} />{tx(...backLabel)}</button>
        <div><h1>{tx("无法打开这份训练档案", "This training profile cannot be opened")}</h1></div>
      </header>
      <CareerDataStatus
        tone="error"
        title={tx("无法读取这份训练档案", "This training profile is unavailable")}
        message={tx("该项目没有注册生涯模块，或当前记录已经被删除。请返回后选择其他记录。", "The project has no registered Career module, or the session was deleted. Go back and choose another session.")}
      />
    </main>
  );
}

function formatGuestSessionTime(completedAt: string) {
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return tx("刚刚", "Just now");
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

function guestProjectName(session: TrainingSessionSubmission) {
  const module = getCareerProjectModule(session.trainingId);
  return module ? tx(...module.definition.name) : session.trainingId.toUpperCase();
}

export function CareerGuestIntro({ onLogin }: { onLogin: () => void }) {
  const localSessions = [...listPendingGuestTrainingSessions()]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  return (
    <main className="workspace-main career-game-plan career-guest-intro">
      <section className="career-guest-landing">
        <div className="career-guest-data-streams" aria-hidden="true">
          {CAREER_GUEST_DATA_ROWS.map((row, rowIndex) => (
            <span key={row[0][0]} data-direction={rowIndex % 2 ? "reverse" : "forward"}>
              {[...row, ...row, ...row].map((cell, cellIndex) => <i key={`${cell[0]}-${cellIndex}`}>{tx(cell[0], cell[1])}</i>)}
            </span>
          ))}
        </div>
        <div className="career-guest-layout">
          <div className="career-guest-center">
            <h1 aria-label={tx("不只记录成绩，更告诉你下一步练什么", "More than scores. Know what to train next.")}>
              <span aria-hidden="true">{tx("不只记录成绩", "More than scores")}</span>
              <span aria-hidden="true">{tx("更告诉你下一步练什么", "Know what to train next")}</span>
            </h1>
            <p>{tx(
              "生涯会保存训练记录、建立长期能力档案。AI 会分析你的优势和短板；未来还会结合游戏目标，生成训练计划。",
              "Career saves your sessions and builds a long-term capability profile. AI finds strengths and weak points, and will turn game goals into a training plan.",
            )}</p>
            <button className="career-guest-action" type="button" onClick={onLogin}>
              <LogIn size={18} />
              <strong>{tx("登录开启我的生涯", "Sign in to start my Career")}</strong>
              <ArrowRight size={19} />
            </button>
          </div>

          <aside className="career-guest-local" aria-label={tx("访客训练记录", "Guest training records")}>
            <header>
              <span><History size={16} /><b>{tx("本次访问训练", "Training this visit")}</b></span>
              <small>{tx(`待保存 ${localSessions.length} 局`, `${localSessions.length} awaiting save`)}</small>
            </header>
            <div className="career-guest-local-list">
              {localSessions.length > 0 ? localSessions.map((session) => (
                <article key={session.clientSessionId}>
                  <header>
                    <span><b>{guestProjectName(session)}</b><small>{session.sessionType === "benchmark" ? tx("标准训练", "Standard training") : tx("自由练习", "Free practice")}</small></span>
                    <time dateTime={session.completedAt}><Clock3 size={12} />{formatGuestSessionTime(session.completedAt)}</time>
                  </header>
                  <div>
                    <strong>{Math.round(session.summary.score).toLocaleString()}</strong>
                    <span><small>{tx("准确率", "Accuracy")}</small><b>{session.summary.accuracy.toFixed(1)}%</b></span>
                    <span><small>{tx("时长", "Duration")}</small><b>{formatSeconds(Math.round(session.durationMs / 1_000))}</b></span>
                    <em data-grade={session.summary.grade}>{session.summary.grade}</em>
                  </div>
                </article>
              )) : (
                <div className="career-guest-local-empty">
                  <History size={20} />
                  <b>{tx("还没有访客训练记录", "No guest training yet")}</b>
                  <small>{tx("完成一局训练后，数据会显示在这里。", "Finish a session and its data will appear here.")}</small>
                </div>
              )}
            </div>
            <footer><LogIn size={13} />{tx("登录即可保存到生涯", "Sign in to save to Career")}</footer>
          </aside>
        </div>
      </section>

      <section className="career-guest-path" aria-label={tx("生涯成长路径", "Career growth path")}>
        <span><i><History size={16} /></i><b>{tx("训练记录", "Training history")}</b><small>{tx("每局留档", "Every session")}</small></span>
        <span><i><Layers3 size={16} /></i><b>{tx("能力档案", "Capability profile")}</b><small>{tx("看见强项与短板", "See strengths and gaps")}</small></span>
        <span className="is-ai"><i><Sparkles size={16} /></i><b>{tx("AI 分析", "AI analysis")}</b><small>{tx("给出下一步重点", "Set the next focus")}</small></span>
        <span className="is-planned"><i><Route size={16} /></i><b>{tx("游戏训练计划", "Game training plan")}</b><small>{tx("即将开放", "Coming soon")}</small></span>
      </section>
    </main>
  );
}

export function CareerPage({
  projectSettings = {},
  onStartTraining,
  onBrowseTraining,
  onLogin,
}: CareerPageProps) {
  const authStatus = useAuthStore((state) => state.status);
  const initializeAuth = useAuthStore((state) => state.initialize);
  const userId = useAuthStore((state) => state.user?.id);
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const language = getAppLanguage();
  const modules = useMemo(() => listCareerProjectModules(), []);
  const loadContext = useCallback((projectId: string): CareerProjectLoadContext => ({
    authenticated: authStatus === "authenticated",
    isAdmin,
    settings: projectSettings[projectId],
  }), [authStatus, isAdmin, projectSettings]);
  const [datasets, setDatasets] = useState<Record<string, CareerProjectDataset>>(() => Object.fromEntries(
    modules.map((module) => {
      const projectId = module.definition.id;
      const context = loadContext(projectId);
      const cached = context.authenticated
        ? readCareerProjectDatasetCache(userId, projectId)
        : null;
      return [projectId, cached ?? module.loadLocal(context)];
    }),
  ));
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [primaryView, setPrimaryView] = useState<CareerPrimaryView>(() => readCareerPrimaryView(userId));
  const primaryViewUserId = useRef(userId);
  const [pageDirection, setPageDirection] = useState<CareerPageDirection>("next");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    const storedProjectId = readCareerActiveProject(userId);
    return storedProjectId && getCareerProjectModule(storedProjectId) ? storedProjectId : null;
  });
  const [selectedSession, setSelectedSession] = useState<SelectedSession | null>(null);
  const [sessionDetail, setSessionDetail] = useState<unknown | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionCanRetry, setSessionCanRetry] = useState(false);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) {
      primaryViewUserId.current = undefined;
      return;
    }
    if (primaryViewUserId.current !== userId) {
      primaryViewUserId.current = userId;
      setPrimaryView(readCareerPrimaryView(userId));
      setPageDirection("next");
      const storedProjectId = readCareerActiveProject(userId);
      setActiveProjectId(storedProjectId && getCareerProjectModule(storedProjectId) ? storedProjectId : null);
      setSelectedSession(null);
      return;
    }
    window.sessionStorage.setItem(careerPrimaryViewStorageKey(userId), primaryView);
    if (activeProjectId && getCareerProjectModule(activeProjectId)) {
      window.sessionStorage.setItem(careerActiveProjectStorageKey(userId), activeProjectId);
    } else {
      window.sessionStorage.removeItem(careerActiveProjectStorageKey(userId));
    }
  }, [activeProjectId, primaryView, userId]);

  useEffect(() => {
    let active = true;
    const contexts = Object.fromEntries(
      modules.map((module) => [module.definition.id, loadContext(module.definition.id)]),
    );
    const seeds = Object.fromEntries(modules.map((module) => {
      const projectId = module.definition.id;
      const context = contexts[projectId];
      const cached = context.authenticated
        ? readCareerProjectDatasetCache(userId, projectId)
        : null;
      return [projectId, cached ?? module.loadLocal(context)];
    }));
    setDatasets(seeds);
    setLoadingProjects(Object.fromEntries(
      modules.map((module) => [module.definition.id, contexts[module.definition.id].authenticated]),
    ));
    modules.forEach((module) => {
      const projectId = module.definition.id;
      const context = contexts[projectId];
      if (!context.authenticated) return;
      void module.loadRemote(seeds[projectId], context).then((dataset) => {
        writeCareerProjectDatasetCache(userId, projectId, dataset);
        if (!active) return;
        setDatasets((current) => ({ ...current, [projectId]: dataset }));
      }).catch((error: unknown) => {
        if (!active) return;
        const reason = error instanceof Error && error.message.trim()
          ? tx(`服务返回：${error.message}`, `Service response: ${error.message}`)
          : tx("未收到可识别的服务响应", "No usable response was received from the service");
        setDatasets((current) => ({
          ...current,
          [projectId]: {
            ...seeds[projectId],
            notice: tx(
              `项目数据加载失败。${reason}。当前显示已保存的数据，请检查网络连接与后端服务后重试。`,
              `Project data failed to load. ${reason}. Saved data is shown instead. Check the network and backend service, then try again.`,
            ),
          },
        }));
      }).finally(() => {
        if (!active) return;
        setLoadingProjects((current) => ({ ...current, [projectId]: false }));
      });
    });
    return () => { active = false; };
  }, [loadContext, refreshKey, modules, userId]);

  const contributions = useMemo(() => {
    void language; // Contribution models contain localized display copy.
    return modules.flatMap((module) => {
      const dataset = datasets[module.definition.id];
      return dataset ? [module.buildContribution(dataset)] : [];
    });
  }, [datasets, language, modules]);
  const overviewModel = useMemo(() => aggregateCareerOverview(contributions), [contributions]);
  const loading = Object.values(loadingProjects).some(Boolean);
  const notice = [...new Set(Object.values(datasets).map((dataset) => dataset.notice).filter((value): value is string => Boolean(value)))].join(" ") || null;

  const activeModule = activeProjectId ? getCareerProjectModule(activeProjectId) : undefined;
  const activeDataset = activeProjectId ? datasets[activeProjectId] : undefined;

  const refreshActiveProject = (projectId: string) => {
    setPrimaryView("projects");
    setActiveProjectId(projectId);
    setRefreshKey((value) => value + 1);
  };
  const selectedModule = selectedSession ? getCareerProjectModule(selectedSession.projectId) : undefined;
  const selectedDataset = selectedSession ? datasets[selectedSession.projectId] : undefined;
  const selectedRecord: CareerProjectSession | undefined = selectedSession && selectedDataset
    ? selectedDataset.sessions.find((session) => session.key === selectedSession.sessionKey)
    : undefined;

  useEffect(() => {
    let active = true;
    if (!selectedSession || !selectedModule || !selectedDataset || !selectedRecord) {
      setSessionDetail(null);
      setSessionLoading(false);
      setSessionCanRetry(false);
      setSessionError(selectedSession ? tx("这条训练记录已不可用。", "This training session is no longer available.") : null);
      return () => { active = false; };
    }
    const request = selectedModule.prepareSessionReview(
      selectedRecord,
      selectedDataset,
      projectSettings[selectedSession.projectId],
    );
    setSessionDetail(request.initialDetail);
    setSessionCanRetry(Boolean(request.remoteDetail));
    setSessionError(request.initialDetail || request.remoteDetail ? null : request.missingDetailMessage);
    if (!request.remoteDetail) {
      setSessionLoading(false);
      return () => { active = false; };
    }
    setSessionLoading(true);
    void request.remoteDetail.then((detail) => {
      if (!active) return;
      setSessionDetail(detail);
      setSessionError(null);
    }).catch(() => {
      if (!active) return;
      setSessionError(request.initialDetail
        ? `${request.remoteErrorMessage} ${tx("当前显示本地保存的分析，内容可能不是最新。", "The saved local analysis is shown and may not be current.")}`
        : request.remoteErrorMessage);
    }).finally(() => {
      if (active) setSessionLoading(false);
    });
    return () => { active = false; };
  }, [projectSettings, selectedDataset, selectedModule, selectedRecord, selectedSession, sessionRefreshKey]);

  if (authStatus === "loading") {
    return (
      <main className="workspace-main career-page career-access-status">
        <CareerDataStatus
          tone="loading"
          title={tx("正在确认登录状态", "Checking your sign-in status")}
          message={tx("身份确认完成后会自动打开生涯数据，请稍候。", "Career data will open automatically after your account is verified.")}
        />
      </main>
    );
  }

  if (authStatus === "offline") {
    return (
      <main className="workspace-main career-page career-access-status">
        <CareerDataStatus
          tone="error"
          title={tx("无法连接生涯服务", "Unable to reach the Career service")}
          message={tx("身份服务当前不可用。请检查网络连接并确认后端已经启动，然后重试。", "The identity service is unavailable. Check the network and make sure the backend is running, then try again.")}
          actionLabel={tx("重新连接", "Reconnect")}
          onAction={() => { void initializeAuth(); }}
        />
      </main>
    );
  }

  if (authStatus === "guest") {
    return <CareerGuestIntro onLogin={onLogin} />;
  }

  const selectPrimaryView = (view: CareerPrimaryView, direction: CareerPageDirection = "next") => {
    setPageDirection(direction);
    setPrimaryView(view);
    setActiveProjectId(null);
    setSelectedSession(null);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const openProject = (projectId: string) => {
    setPrimaryView("projects");
    setActiveProjectId(projectId);
    setSelectedSession(null);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const openSession = (projectId: string, sessionKey: string, origin: SelectedSession["origin"]) => {
    if (origin === "overview") {
      setPrimaryView("overview");
      setActiveProjectId(null);
    } else {
      setPrimaryView("projects");
      setActiveProjectId(projectId);
    }
    setSelectedSession({ projectId, sessionKey, origin });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const closeSession = () => {
    if (selectedSession?.origin === "overview") {
      setPrimaryView("overview");
      setActiveProjectId(null);
    } else if (selectedSession) {
      setPrimaryView("projects");
      setActiveProjectId(selectedSession.projectId);
    }
    setSelectedSession(null);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  if (selectedSession) {
    if (!selectedModule || !selectedRecord) {
      return <ProjectUnavailable
        onBack={closeSession}
        backLabel={selectedSession.origin === "overview" ? ["返回", "Back"] : undefined}
      />;
    }
    return selectedModule.renderSessionReview({
      session: selectedRecord,
      detail: sessionDetail,
      loading: sessionLoading,
      error: sessionError,
      backLabel: selectedSession.origin === "overview"
        ? ["返回", "Back"]
        : ["返回 GRID SHOT 档案", "Back to Grid Shot profile"],
      onBack: closeSession,
      onRetry: sessionCanRetry ? () => setSessionRefreshKey((value) => value + 1) : undefined,
    });
  }

  if (primaryView === "game-plan") {
    return (
      <CareerPageCarousel view="game-plan" direction={pageDirection} onNavigate={selectPrimaryView}>
        <CareerGamePlan />
      </CareerPageCarousel>
    );
  }

  if (primaryView === "overview") {
    return (
      <CareerPageCarousel view="overview" direction={pageDirection} onNavigate={selectPrimaryView}>
        <CareerOverview
          model={overviewModel}
          loading={loading}
          notice={notice}
          onBrowseTraining={onBrowseTraining}
          onOpenSession={(projectId, sessionKey) => openSession(projectId, sessionKey, "overview")}
          onRetry={() => setRefreshKey((value) => value + 1)}
        />
      </CareerPageCarousel>
    );
  }

  if (activeProjectId === null) {
    return (
      <CareerPageCarousel view="projects" direction={pageDirection} onNavigate={selectPrimaryView}>
        <CareerProjectDirectory
          projects={overviewModel.projects}
          loading={loading}
          notice={notice}
          onOpenProject={openProject}
          onRetry={() => setRefreshKey((value) => value + 1)}
        />
      </CareerPageCarousel>
    );
  }

  return (
    <CareerPageCarousel
      view="projects"
      direction={pageDirection}
      onNavigate={selectPrimaryView}
      showNavigationControls={activeProjectId !== "grid-shot"}
    >
      {activeModule && activeDataset
        ? activeModule.renderProfile({
          dataset: activeDataset,
          loading: loadingProjects[activeProjectId] ?? false,
          authenticated: authStatus === "authenticated",
          isAdmin,
          settings: projectSettings[activeProjectId],
          onBack: () => setActiveProjectId(null),
          onRefresh: () => refreshActiveProject(activeProjectId),
          onOpenSession: (sessionKey) => openSession(activeProjectId, sessionKey, "project"),
          onStartTraining: (entryId) => onStartTraining(activeProjectId, entryId),
          onBrowseTraining,
        })
        : <ProjectUnavailable onBack={() => setActiveProjectId(null)} />}
    </CareerPageCarousel>
  );
}
