import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  History,
  Layers3,
  LogIn,
  Route,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../features/auth/authStore";
import { CareerGamePlan } from "../features/career/CareerGamePlan";
import { CareerOverview } from "../features/career/CareerOverview";
import { aggregateCareerOverview } from "../features/career/careerOverviewAggregation";
import {
  CareerPageCarousel,
  type CareerPageDirection,
  type CareerPrimaryView,
} from "../features/career/CareerPageCarousel";
import { CareerProjectDirectory } from "../features/career/CareerProjectDirectory";
import type {
  CareerProjectDataset,
  CareerProjectLoadContext,
  CareerProjectSession,
} from "../features/career/careerProjectModule";
import {
  getCareerProjectModule,
  listCareerProjectModules,
} from "../features/career/careerProjectRegistry";
import { tx } from "../i18n";
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
}

const PRIMARY_VIEW_STORAGE_KEY = "neon-aim:career-primary-view";
const CAREER_GUEST_DATA_ROWS = [
  ["SESSION STREAM", "TRAINING RECORD", "PROJECT PROFILE", "CAPABILITY EVIDENCE"],
  ["ACCURACY", "SPEED", "STABILITY", "CONTROL"],
  ["AI ANALYSIS", "TREND SIGNAL", "NEXT FOCUS", "CONFIDENCE"],
  ["GAME GOAL", "TRAINING PLAN", "REVIEW LOOP", "PROGRESS"],
] as const;

function readPrimaryView(): CareerPrimaryView {
  if (typeof window === "undefined") return "overview";
  const stored = window.sessionStorage.getItem(PRIMARY_VIEW_STORAGE_KEY);
  return stored === "projects" || stored === "game-plan" ? stored : "overview";
}

function ProjectUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <main className="workspace-main career-page career-detail-page">
      <header className="career-detail-header">
        <button type="button" onClick={onBack}><ArrowLeft size={16} />{tx("返回训练项目", "Back to projects")}</button>
        <div><span>{tx("项目不可用", "PROJECT UNAVAILABLE")}</span><h1>{tx("无法打开这份训练档案", "This training profile cannot be opened")}</h1></div>
      </header>
      <div className="career-error"><AlertTriangle size={18} /><span>{tx("该项目没有注册生涯模块，或当前记录已经不可用。", "The project has no registered career module, or this session is no longer available.")}</span></div>
    </main>
  );
}

export function CareerGuestIntro({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="workspace-main career-game-plan career-guest-intro">
      <section className="career-guest-landing">
        <div className="career-guest-data-streams" aria-hidden="true">
          {CAREER_GUEST_DATA_ROWS.map((row, rowIndex) => (
            <span key={row[0]} data-direction={rowIndex % 2 ? "reverse" : "forward"}>
              {[...row, ...row, ...row].map((cell, cellIndex) => <i key={`${cell}-${cellIndex}`}>{cell}</i>)}
            </span>
          ))}
        </div>
        <div className="career-guest-center">
          <span><i />CAREER INTELLIGENCE<i /></span>
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
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  const modules = useMemo(() => listCareerProjectModules(), []);
  const loadContext = useCallback((projectId: string): CareerProjectLoadContext => ({
    authenticated: authStatus === "authenticated",
    isAdmin,
    settings: projectSettings[projectId],
  }), [authStatus, isAdmin, projectSettings]);
  const [datasets, setDatasets] = useState<Record<string, CareerProjectDataset>>(() => Object.fromEntries(
    modules.map((module) => [module.definition.id, module.loadLocal(loadContext(module.definition.id))]),
  ));
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [primaryView, setPrimaryView] = useState<CareerPrimaryView>(readPrimaryView);
  const [pageDirection, setPageDirection] = useState<CareerPageDirection>("next");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SelectedSession | null>(null);
  const [sessionDetail, setSessionDetail] = useState<unknown | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    window.sessionStorage.setItem(PRIMARY_VIEW_STORAGE_KEY, primaryView);
  }, [primaryView]);

  useEffect(() => {
    let active = true;
    const locals = Object.fromEntries(
      modules.map((module) => [module.definition.id, module.loadLocal(loadContext(module.definition.id))]),
    );
    setDatasets(locals);
    setLoadingProjects(Object.fromEntries(modules.map((module) => [module.definition.id, true])));
    modules.forEach((module) => {
      const projectId = module.definition.id;
      void module.loadRemote(locals[projectId], loadContext(projectId)).then((dataset) => {
        if (!active) return;
        setDatasets((current) => ({ ...current, [projectId]: dataset }));
      }).catch(() => {
        if (!active) return;
        setDatasets((current) => ({
          ...current,
          [projectId]: {
            ...locals[projectId],
            notice: tx("项目数据暂时无法刷新，请稍后重试。", "Project data could not be refreshed. Please try again later."),
          },
        }));
      }).finally(() => {
        if (!active) return;
        setLoadingProjects((current) => ({ ...current, [projectId]: false }));
      });
    });
    return () => { active = false; };
  }, [loadContext, refreshKey, modules]);

  const contributions = useMemo(() => modules.flatMap((module) => {
    const dataset = datasets[module.definition.id];
    return dataset ? [module.buildContribution(dataset)] : [];
  }), [datasets, modules]);
  const overviewModel = useMemo(() => aggregateCareerOverview(contributions), [contributions]);
  const loading = Object.values(loadingProjects).some(Boolean);
  const notice = Object.values(datasets).map((dataset) => dataset.notice).find(Boolean) ?? null;

  const activeModule = activeProjectId ? getCareerProjectModule(activeProjectId) : undefined;
  const activeDataset = activeProjectId ? datasets[activeProjectId] : undefined;
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
      setSessionError(selectedSession ? tx("这条训练记录已不可用。", "This training session is no longer available.") : null);
      return () => { active = false; };
    }
    const request = selectedModule.prepareSessionReview(
      selectedRecord,
      selectedDataset,
      projectSettings[selectedSession.projectId],
    );
    setSessionDetail(request.initialDetail);
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
      if (!active || request.initialDetail) return;
      setSessionError(request.remoteErrorMessage);
    }).finally(() => {
      if (active) setSessionLoading(false);
    });
    return () => { active = false; };
  }, [projectSettings, selectedDataset, selectedModule, selectedRecord, selectedSession]);

  if (authStatus !== "authenticated") {
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

  const openSession = (projectId: string, sessionKey: string) => {
    setPrimaryView("projects");
    setActiveProjectId(projectId);
    setSelectedSession({ projectId, sessionKey });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const startOverviewGoal = () => {
    if (overviewModel.goal.projectId && overviewModel.goal.entryId) {
      onStartTraining(overviewModel.goal.projectId, overviewModel.goal.entryId);
    } else {
      onBrowseTraining();
    }
  };

  if (selectedSession) {
    if (!selectedModule || !selectedRecord) {
      return <ProjectUnavailable onBack={() => setSelectedSession(null)} />;
    }
    return selectedModule.renderSessionReview({
      session: selectedRecord,
      detail: sessionDetail,
      loading: sessionLoading,
      error: sessionError,
      onBack: () => setSelectedSession(null),
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
          onStartGoal={startOverviewGoal}
          onBrowseTraining={onBrowseTraining}
          onOpenProject={openProject}
          onOpenSession={openSession}
          onOpenGamePlan={() => selectPrimaryView("game-plan", "previous")}
        />
      </CareerPageCarousel>
    );
  }

  if (activeProjectId === null) {
    return (
      <CareerPageCarousel view="projects" direction={pageDirection} onNavigate={selectPrimaryView}>
        <CareerProjectDirectory projects={overviewModel.projects} onOpenProject={openProject} onBrowseTraining={onBrowseTraining} />
      </CareerPageCarousel>
    );
  }

  return (
    <CareerPageCarousel view="projects" direction={pageDirection} onNavigate={selectPrimaryView}>
      {activeModule && activeDataset
        ? activeModule.renderProfile({
          dataset: activeDataset,
          loading: loadingProjects[activeProjectId] ?? false,
          authenticated: authStatus === "authenticated",
          isAdmin,
          settings: projectSettings[activeProjectId],
          onBack: () => setActiveProjectId(null),
          onRefresh: () => setRefreshKey((value) => value + 1),
          onOpenSession: (sessionKey) => openSession(activeProjectId, sessionKey),
          onStartTraining: (entryId) => onStartTraining(activeProjectId, entryId),
          onBrowseTraining,
        })
        : <ProjectUnavailable onBack={() => setActiveProjectId(null)} />}
    </CareerPageCarousel>
  );
}
