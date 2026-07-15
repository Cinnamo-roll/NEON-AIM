import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Sparkles } from "@react-three/drei";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Award,
  Blocks,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Gamepad2,
  Gauge,
  Hammer,
  Eye,
  LogOut,
  Settings,
  Target,
  Timer,
  UserRound,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { create } from "zustand";
import { GridShotTrainingPage } from "./pages/GridShotTrainingPage";
import { TrainingCrosshair } from "./components/training/Crosshair";
import type {
  GridShotHistoryRecord,
  TrainingSettings,
} from "./game/types/training";
import { saveGridShotTrainingSession } from "./game/modes/gridShot/gridShotTrainingSessionService";
import {
  clearRetiredLocalTrainingData,
  type TrainingSessionSaveStatus,
} from "./game/storage/trainingSessionService";
import {
  createNeonInputSensitivity,
  normalizeNeonInputSettings,
} from "./game/sensitivity/sensitivity";
import { BrowserFrameMonitor } from "./game/performance/PerformanceMonitor";
import { interfaceAudio } from "./game/audio/interfaceAudio";
import { sanitizeTrainingSettings } from "./game/settings/trainingSettings";
import {
  applyAccountPreferenceDocument,
  applyDeviceTrainingSettings,
  applyGridShotDeviceSettings,
  createAccountPreferenceDocument,
  deviceTrainingSettings,
  DEVICE_SETTINGS_STORAGE_KEY,
  GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY,
  gridShotDeviceSettings,
  GRID_SHOT_DEVICE_SETTINGS_STORAGE_KEY,
} from "./game/settings/accountPreferences";
import { useAccountPreferencesSync } from "./game/settings/useAccountPreferencesSync";
import { CROSSHAIR_PRESETS, matchCrosshairPreset } from "./game/settings/crosshairPresets";
import {
  applyGridShotBenchmarkRules,
  sanitizeGridShotModeSettings,
  type GridShotModeSettings,
  type GridShotSessionType,
} from "./game/modes/gridShot/gridShotConfig";
import { SettingsWorkspace } from "./pages/SettingsWorkspace";
import { GridShotResultPage } from "./pages/GridShotResultPage";
import { CareerPage } from "./pages/CareerPage";
import { GridShotSettingsPreview } from "./components/training/GridShotSettingsPreview";
import { GameIcon } from "./components/GameIcon";
import { PlayerAvatar, ProfileWorkspace } from "./features/auth/ProfileWorkspace";
import { useAuthStore } from "./features/auth/authStore";
import { setAppLanguage, tx } from "./i18n";
import {
  filterTrainingCatalog,
  getLocalizedTrainingCopy,
  getTrainingCategoryLabel,
  getTrainingDifficultyLabel,
  getTrainingGameFitReason,
  groupTrainingCatalogByDifficulty,
  rankTrainingCatalogForGame,
  trainingCatalogEntries,
  trainingDifficulties,
  trainingGameLabels,
  trainingGames,
  type TrainingCatalogEntry,
  type TrainingDifficultyId,
} from "./game/trainingCatalog";
import "./App.css";
import "./gameShell.css";

type ModeId = "grid" | "reflex" | "tracking";
type Page = "boot" | "home" | "modes" | "game" | "results" | "progress" | "workshop" | "ranking" | "profile" | "settings" | "qa";
type SettingsData = TrainingSettings;
type GridSaveState = {
  sessionId?: string;
  serverSessionId?: string;
  status: TrainingSessionSaveStatus;
  loginRequested?: boolean;
};
type Result = {
  mode: ModeId;
  score: number;
  hits: number;
  shots: number;
  accuracy: number;
  reaction: number;
  combo: number;
  date: string;
};
type AppState = {
  page: Page;
  mode: ModeId;
  settings: SettingsData;
  gridShotSettings: GridShotModeSettings;
  gridShotSessionType: GridShotSessionType;
  results: Result[];
  gridResult?: GridShotHistoryRecord;
  previousGridResult?: GridShotHistoryRecord;
  gridSaveState: GridSaveState;
  setPage: (p: Page) => void;
  setMode: (m: ModeId) => void;
  updateSettings: (v: Partial<SettingsData>) => void;
  updateGridShotSettings: (v: Partial<GridShotModeSettings>) => void;
  setGridShotSessionType: (value: GridShotSessionType) => void;
  applyAccountPreferences: (value: unknown) => void;
  restoreGuestPreferences: () => void;
  saveResult: (r: Result) => void;
  setGridResult: (r?: GridShotHistoryRecord, p?: GridShotHistoryRecord) => void;
  setGridSaveState: (state: GridSaveState) => void;
};
const load = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
};
const legacyRawSettings = load<Record<string, unknown>>("neon-settings", {});
const legacySettings = sanitizeTrainingSettings(legacyRawSettings);
const legacyGridShotSettings = sanitizeGridShotModeSettings({
  hitVolume: legacyRawSettings.hitVolume,
  missVolume: legacyRawSettings.missVolume,
  comboVolume: legacyRawSettings.comboVolume,
  ...load<Record<string, unknown>>("neon-grid-shot-settings", {}),
});
const legacyGridShotSessionType = load<GridShotSessionType>("neon-grid-shot-session-type", "practice") === "benchmark"
  ? "benchmark"
  : "practice";
const locallyConfiguredSettings = applyDeviceTrainingSettings(
  legacySettings,
  load(DEVICE_SETTINGS_STORAGE_KEY, deviceTrainingSettings(legacySettings)),
);
const locallyConfiguredGridShotSettings = applyGridShotDeviceSettings(
  legacyGridShotSettings,
  load(GRID_SHOT_DEVICE_SETTINGS_STORAGE_KEY, gridShotDeviceSettings(legacyGridShotSettings)),
);
const legacyGuestPreferences = createAccountPreferenceDocument(
  legacySettings,
  legacyGridShotSettings,
  legacyGridShotSessionType,
);
const loadedPreferences = applyAccountPreferenceDocument(
  {
    settings: locallyConfiguredSettings,
    gridShotSettings: locallyConfiguredGridShotSettings,
    gridShotSessionType: legacyGridShotSessionType,
  },
  load(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY, legacyGuestPreferences),
);
const normalizedLoadedSettings: SettingsData = {
  ...loadedPreferences.settings,
  ...normalizeNeonInputSettings(loadedPreferences.settings),
};
const loadedGridShotSessionType = loadedPreferences.gridShotSessionType;
const loadedGridShotSettings = loadedPreferences.gridShotSettings;
localStorage.setItem(DEVICE_SETTINGS_STORAGE_KEY, JSON.stringify(deviceTrainingSettings(normalizedLoadedSettings)));
localStorage.setItem(
  GRID_SHOT_DEVICE_SETTINGS_STORAGE_KEY,
  JSON.stringify(gridShotDeviceSettings(loadedGridShotSettings)),
);
if (localStorage.getItem(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY) === null) {
  localStorage.setItem(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY, JSON.stringify(legacyGuestPreferences));
}
const pathPage = (): Page =>
  import.meta.env.DEV && location.pathname.startsWith("/dev/grid-shot-qa")
    ? "qa"
    : location.pathname.startsWith("/training/grid-shot")
    ? "game"
    : location.pathname.startsWith("/training")
      ? "modes"
    : location.pathname.startsWith("/results/grid-shot")
      ? "results"
      : location.pathname.startsWith("/progress")
        ? "progress"
        : location.pathname.startsWith("/workshop") || location.pathname.startsWith("/tools")
          ? "workshop"
          : location.pathname.startsWith("/ranking") || location.pathname.startsWith("/compete")
            ? "ranking"
          : location.pathname.startsWith("/profile")
            ? "profile"
      : location.pathname.startsWith("/settings")
        ? "settings"
        : "boot";
const pagePath: Record<Page, string> = {
  boot: "/",
  home: "/",
  modes: "/training",
  game: "/training/grid-shot",
  results: "/results/grid-shot",
  progress: "/progress",
  workshop: "/workshop",
  ranking: "/ranking",
  profile: "/profile",
  settings: "/settings",
  qa: "/dev/grid-shot-qa",
};
const useApp = create<AppState>((set, get) => ({
  page: pathPage(),
  mode: "grid",
  settings: normalizedLoadedSettings,
  gridShotSettings: loadedGridShotSessionType === "benchmark"
    ? applyGridShotBenchmarkRules(loadedGridShotSettings)
    : loadedGridShotSettings,
  gridShotSessionType: loadedGridShotSessionType,
  results: load("neon-results", []),
  gridSaveState: { status: "idle" },
  setPage: (page) => {
    const current = get();
    if (current.page === page) return;
    if (current.page !== "boot") {
      interfaceAudio.play(
        "navigate",
        current.settings.volume * current.settings.interfaceVolume,
        current.settings.muted || current.settings.interfaceMuted,
      );
    }
    if (location.pathname !== pagePath[page]) history.pushState({}, "", pagePath[page]);
    set({ page });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  },
  setMode: (mode) => set({ mode }),
  updateSettings: (v) =>
    set((s) => {
      const merged = { ...s.settings, ...v };
      const settings = { ...merged, ...normalizeNeonInputSettings(merged) };
      localStorage.setItem(DEVICE_SETTINGS_STORAGE_KEY, JSON.stringify(deviceTrainingSettings(settings)));
      if (useAuthStore.getState().status !== "authenticated") {
        localStorage.setItem(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY, JSON.stringify(
          createAccountPreferenceDocument(settings, s.gridShotSettings, s.gridShotSessionType),
        ));
      }
      return { settings };
    }),
  updateGridShotSettings: (v) =>
    set((state) => {
      const gridShotSettings = sanitizeGridShotModeSettings({ ...state.gridShotSettings, ...v });
      localStorage.setItem(
        GRID_SHOT_DEVICE_SETTINGS_STORAGE_KEY,
        JSON.stringify(gridShotDeviceSettings(gridShotSettings)),
      );
      if (useAuthStore.getState().status !== "authenticated") {
        localStorage.setItem(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY, JSON.stringify(
          createAccountPreferenceDocument(state.settings, gridShotSettings, state.gridShotSessionType),
        ));
      }
      return { gridShotSettings };
    }),
  setGridShotSessionType: (gridShotSessionType) => set((state) => {
    if (useAuthStore.getState().status !== "authenticated") {
      localStorage.setItem(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY, JSON.stringify(
        createAccountPreferenceDocument(state.settings, state.gridShotSettings, gridShotSessionType),
      ));
    }
    return { gridShotSessionType };
  }),
  applyAccountPreferences: (value) => set((state) => applyAccountPreferenceDocument({
    settings: state.settings,
    gridShotSettings: state.gridShotSettings,
    gridShotSessionType: state.gridShotSessionType,
  }, value)),
  restoreGuestPreferences: () => set((state) => applyAccountPreferenceDocument({
    settings: state.settings,
    gridShotSettings: state.gridShotSettings,
    gridShotSessionType: state.gridShotSessionType,
  }, load(GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY, createAccountPreferenceDocument(
    normalizedLoadedSettings,
    loadedGridShotSettings,
    loadedGridShotSessionType,
  )))),
  saveResult: (r) =>
    set((s) => {
      const results = [r, ...s.results].slice(0, 30);
      localStorage.setItem("neon-results", JSON.stringify(results));
      return { results };
    }),
  setGridResult: (gridResult, previousGridResult) =>
    set({ gridResult, previousGridResult }),
  setGridSaveState: (gridSaveState) => set({ gridSaveState }),
}));

function openGridShotSession(sessionType: GridShotSessionType) {
  const app = useApp.getState();
  app.setMode("grid");
  app.setGridShotSessionType(sessionType);
  if (sessionType === "benchmark") {
    app.updateGridShotSettings(applyGridShotBenchmarkRules(app.gridShotSettings));
  }
  app.setPage("game");
}

function persistGridShotResult(record: GridShotHistoryRecord, authenticated: boolean) {
  const app = useApp.getState();
  const sessionType = record.sessionType ?? app.gridShotSessionType;
  app.setGridSaveState({ sessionId: record.sessionId, status: "saving" });
  void saveGridShotTrainingSession(record, app.gridShotSettings, sessionType, authenticated).then((result) => {
    if (useApp.getState().gridSaveState.sessionId === result.sessionId) {
      useApp.getState().setGridSaveState({
        sessionId: result.sessionId,
        serverSessionId: result.serverSessionId,
        status: result.status,
      });
    }
  });
}

function useInterfaceAudioFeedback(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const playForControl = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLElement>(
        'button, a[href], select, [role="button"], [role="menuitem"], [role="option"], input[type="checkbox"], input[type="radio"]',
      );
      if (!control || control.matches(":disabled") || control.getAttribute("aria-disabled") === "true") return;
      if (control.closest('[data-interface-audio="off"]')) return;
      const { settings } = useApp.getState();
      interfaceAudio.playFallback(
        "select",
        settings.volume * settings.interfaceVolume,
        settings.muted || settings.interfaceMuted,
      );
    };
    document.addEventListener("click", playForControl, true);
    return () => document.removeEventListener("click", playForControl, true);
  }, [enabled]);
}

function AudioEngine() {
  const ctx = useRef<AudioContext | null>(null);
  return (kind: "hit" | "ui") => {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx.current ??= new C();
    const o = ctx.current.createOscillator(),
      g = ctx.current.createGain();
    o.frequency.value = kind === "hit" ? 620 : 240;
    o.frequency.exponentialRampToValueAtTime(
      kind === "hit" ? 1080 : 320,
      ctx.current.currentTime + 0.06,
    );
    g.gain.setValueAtTime(
      0.05 * useApp.getState().settings.volume,
      ctx.current.currentTime,
    );
    g.gain.exponentialRampToValueAtTime(0.001, ctx.current.currentTime + 0.09);
    o.connect(g).connect(ctx.current.destination);
    o.start();
    o.stop(ctx.current.currentTime + 0.1);
  };
}

function Boot() {
  const setPage = useApp((s) => s.setPage);
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(100, x + 4)), 55);
    const done = setTimeout(() => setPage("home"), 1750);
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
  }, [setPage]);
  return (
    <div className="boot">
      <div className="scan" />
      <div className="brand-mark">
        <BrandGlyph />
        <b>NEON</b> AIM
      </div>
      <p>{tx("专注每一次命中", "Make every hit intentional")}</p>
      <div className="boot-status">
        <span>
          {n < 35
            ? tx("校准训练环境", "Calibrating training environment")
            : n < 70
              ? tx("加载目标系统", "Loading target system")
              : tx("同步本地训练数据", "Syncing local training data")}
        </span>
        <em>{n}%</em>
      </div>
      <div className="progress">
        <i style={{ width: `${n}%` }} />
      </div>
      <button onClick={() => setPage("home")}>{tx("立即进入", "Enter now")}</button>
    </div>
  );
}

function BrandGlyph() {
  return (
    <svg className="brand-glyph" viewBox="0 0 40 40" aria-hidden="true">
      <path className="brand-glyph-frame" d="M12 5H5v7M28 5h7v7M12 35H5v-7M28 35h7v-7" />
      <path className="brand-glyph-mark" d="M11.5 29V11l17 18V11" />
      <circle cx="20" cy="20" r="2.6" />
    </svg>
  );
}

type PlayerProgress = { level: number; currentXp: number; requiredXp: number };

function readPlayerProgress(): PlayerProgress {
  const stored = load<Partial<PlayerProgress>>("neon-player-progress", {});
  const level = Math.max(1, Math.floor(Number(stored.level) || 1));
  const requiredXp = Math.max(1, Math.floor(Number(stored.requiredXp) || 1000));
  const currentXp = Math.min(requiredXp, Math.max(0, Math.floor(Number(stored.currentXp) || 0)));
  return { level, currentXp, requiredXp };
}

const primaryNavigation: Array<{ zh: string; en: string; page: Page; anchor?: boolean }> = [
  { zh: "工坊", en: "Workshop", page: "workshop" },
  { zh: "训练", en: "Training", page: "modes" },
  { zh: "大厅", en: "Lobby", page: "home", anchor: true },
  { zh: "生涯", en: "Career", page: "progress" },
  { zh: "排行", en: "Ranks", page: "ranking" },
];

function TopNavigation() {
  const page = useApp((state) => state.page);
  const settings = useApp((state) => state.settings);
  const setPage = useApp((state) => state.setPage);
  const authStatus = useAuthStore((state) => state.status);
  const authUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutArmed, setLogoutArmed] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const progress = readPlayerProgress();
  const progressPercent = Math.round((progress.currentXp / progress.requiredXp) * 100);
  const playerName = authUser?.displayName ?? (authStatus === "loading" ? tx("正在连接", "Connecting") : tx("未登录", "Guest"));
  const membership = authUser?.role.toUpperCase().includes("VIP") ? tx("VIP 会员", "VIP Member") : null;

  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
        setLogoutArmed(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setLogoutArmed(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  const navigate = (destination: Page) => {
    setProfileOpen(false);
    setLogoutArmed(false);
    setPage(destination);
  };
  const toggleProfile = () => {
    interfaceAudio.play(
      profileOpen ? "close" : "open",
      settings.volume * settings.interfaceVolume,
      settings.muted || settings.interfaceMuted,
    );
    if (profileOpen) setLogoutArmed(false);
    setProfileOpen((current) => !current);
  };
  const handlePlayerTrigger = () => {
    if (authStatus !== "authenticated") {
      navigate("profile");
      return;
    }
    toggleProfile();
  };

  return (
    <>
      <header className="app-topbar">
        <button className="topbar-brand" onClick={() => navigate("home")} aria-label={tx("返回大厅", "Return to lobby")}>
          <BrandGlyph />
          <span>NEON <b>AIM</b></span>
        </button>

        <nav className="topbar-navigation" aria-label={tx("主导航", "Primary navigation")}>
          {primaryNavigation.map((item) => {
            const active = page === item.page;
            return (
              <motion.button
                type="button"
                key={item.page}
                className={["topbar-nav-item", item.anchor ? "anchor" : "", active ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => navigate(item.page)}
                aria-current={active ? "page" : undefined}
                whileTap={{ scale: .96 }}
              >
                <span>{tx(item.zh, item.en)}</span>
                {active && <motion.i className="topbar-active-signal" layoutId="topbar-active-signal" transition={{ type: "spring", stiffness: 430, damping: 34 }} />}
              </motion.button>
            );
          })}
        </nav>

        <div className="topbar-player-zone">
          <button type="button" className="topbar-settings" onClick={() => navigate("settings")} aria-label={tx("打开设置", "Open settings")} aria-current={page === "settings" ? "page" : undefined}><Settings size={17} /></button>
          <div className="topbar-player-menu" ref={profileRef}>
          <button type="button" className={`topbar-player-trigger ${authStatus === "authenticated" ? "" : "guest-direct"}`} onClick={handlePlayerTrigger} aria-expanded={authStatus === "authenticated" ? profileOpen : undefined} aria-haspopup={authStatus === "authenticated" ? "menu" : undefined}>
            {authUser
              ? <PlayerAvatar displayName={authUser.displayName} preset={authUser.avatarPreset} size="choice" />
              : <span className="topbar-avatar-fallback" aria-hidden="true"><UserRound size={18} strokeWidth={1.7} /></span>}
            <span className="topbar-player-name">{playerName}</span>
            {authStatus === "authenticated" && <ChevronDown className={profileOpen ? "open" : ""} size={15} />}
          </button>
          <AnimatePresence>
            {profileOpen && authStatus === "authenticated" && authUser && (
              <motion.div
                className="topbar-profile-popover"
                role="menu"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: .16, ease: [0.22, 0.72, 0.24, 1] }}
              >
                <header>
                  <div className="profile-popover-identity">
                    {authUser
                      ? <PlayerAvatar displayName={authUser.displayName} preset={authUser.avatarPreset} size="choice" />
                      : <span className="profile-popover-avatar"><Crosshair size={17} /></span>}
                    <span>{membership && <small>{membership}</small>}<strong>{playerName}</strong></span>
                  </div>
                  <div className="profile-popover-progress">
                    <p>
                      <span className="profile-level-value">LV.<b>{progress.level}</b></span>
                      <span className="profile-xp-value"><b>{progress.currentXp}</b><i>/</i><span>{progress.requiredXp} XP</span></span>
                    </p>
                    <span><i style={{ width: `${progressPercent}%` }} /></span>
                  </div>
                </header>
                <button type="button" role="menuitem" onClick={() => navigate("profile")}>
                  <UserRound size={16} />
                  {tx("个人中心", "Account center")}
                  <ChevronRight size={15} />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`danger ${logoutArmed ? "armed" : ""}`}
                  aria-pressed={logoutArmed}
                  onClick={() => {
                    if (!logoutArmed) {
                      setLogoutArmed(true);
                      return;
                    }
                    setProfileOpen(false);
                    setLogoutArmed(false);
                    void logout();
                  }}
                >
                  {logoutArmed ? <Check size={16} /> : <LogOut size={16} />}
                  {logoutArmed ? tx("确认退出", "Confirm sign out") : tx("退出登录", "Sign out")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </header>
    </>
  );
}

function HomePage() {
  const setPage = useApp((s) => s.setPage);
  const settings = useApp((s) => s.settings);
  const gridShotSettings = useApp((s) => s.gridShotSettings);
  const currentResult = useApp((s) => s.gridResult);
  const authenticated = useAuthStore((state) => state.status === "authenticated");
  const latest = authenticated ? currentResult : null;
  return (
    <PageWrap title={tx("训练中枢", "Training lobby")} className="lobby-page">
      <motion.section
        className="lobby-mission"
        initial={{ opacity: 0, scale: .99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: .35 }}
      >
        <div className="mission-preview" aria-hidden="true">
          <GridShotSettingsPreview settings={settings} modeSettings={gridShotSettings} />
          <div className="mission-preview-shade" />
        </div>
        <div className="mission-copy">
          <span className="mission-mode"><Crosshair size={15} />{tx("精准点击", "Precision clicking")}</span>
          <h1>GRID <b>SHOT</b></h1>
          <div className="mission-metrics">
            <span><small>{tx("时长", "Duration")}</small><b>60 {tx("秒", "sec")}</b></span>
            <span><small>{tx("目标", "Targets")}</small><b>3</b></span>
            <span><small>{tx("训练重点", "Focus")}</small><b>{tx("落点 · 节奏", "Placement · Rhythm")}</b></span>
          </div>
          <div className="mission-actions">
            <button className="primary" onClick={() => openGridShotSession("benchmark")}>
              <Crosshair size={18} />{tx("开始基准训练", "Start benchmark")}<ChevronRight size={17} />
            </button>
            <button onClick={() => setPage("modes")}>{tx("更换训练", "Change drill")}</button>
          </div>
          {latest && (
            <div className="last-run" aria-label={tx("上次训练成绩", "Previous training result")}>
              <span>{tx("上次", "LAST")}</span>
              <b>{latest.score.toLocaleString()}</b>
              <em>{latest.accuracy.toFixed(1)}%</em>
              <em>{Math.round(latest.targetsPerMinute)} TPM</em>
            </div>
          )}
        </div>
        <div className="mission-edge" aria-hidden="true"><i /><span>01</span><i /></div>
      </motion.section>
    </PageWrap>
  );
}
function PageWrap({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={["workspace-main", className].filter(Boolean).join(" ")} aria-label={title}>
      {children}
    </main>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="stat">
      <Icon />
      <span>
        {label}
        <strong>{value}</strong>
        <small>{hint}</small>
      </span>
    </div>
  );
}
function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <span>{action}</span>
      </div>
      {children}
    </section>
  );
}
type FutureHubKind = "progress" | "workshop" | "ranking";

const futureHubContent: Record<FutureHubKind, {
  title: [string, string];
  description: [string, string];
  icon: typeof Zap;
  modules: Array<{ icon: typeof Zap; title: [string, string] }>;
}> = {
  progress: {
    title: ["生涯", "Career"],
    description: ["训练记录、趋势和计划会在这里汇合。", "Training history, trends, and plans will come together here."],
    icon: Activity,
    modules: [
      { icon: Activity, title: ["训练记录", "Training history"] },
      { icon: Bot, title: ["训练复盘", "Training review"] },
      { icon: CalendarDays, title: ["训练计划", "Training plan"] },
    ],
  },
  workshop: {
    title: ["工坊", "Workshop"],
    description: ["发现玩家创作的训练地图，也可以从模板开始制作自己的训练。", "Discover community-made maps or build your own training from a template."],
    icon: Blocks,
    modules: [
      { icon: Gamepad2, title: ["社区地图", "Community maps"] },
      { icon: Hammer, title: ["创建地图", "Create a map"] },
      { icon: UserRound, title: ["我的作品", "My creations"] },
    ],
  },
  ranking: {
    title: ["排行", "Ranks"],
    description: ["按训练地图、球体大小和时长比较完全相同配置下的成绩。", "Compare scores from identical map, target-size, and duration settings."],
    icon: Award,
    modules: [
      { icon: Award, title: ["单项排行", "Drill ranks"] },
      { icon: Target, title: ["地图评级", "Map rating"] },
      { icon: Activity, title: ["我的成绩", "My scores"] },
    ],
  },
};

function FutureHubPage({ kind }: { kind: FutureHubKind }) {
  const content = futureHubContent[kind];
  const Icon = content.icon;
  return (
    <PageWrap title={tx(...content.title)} className="future-hub-page">
      <section className="future-hub-hero">
        <div className="future-hub-symbol"><Icon size={34} /></div>
        <div><p>{tx(...content.description)}</p></div>
        <span className="future-status">{tx("待开发", "Coming soon")}</span>
        <div className="future-module-line">
          {content.modules.map(({ icon: ModuleIcon, title }) => (
            <span key={title[1]}><ModuleIcon size={16} /><b>{tx(...title)}</b><small>{tx("待开发", "Coming soon")}</small></span>
          ))}
        </div>
      </section>
    </PageWrap>
  );
}

function ProfilePage() {
  return <PageWrap title={tx("个人档案", "Player profile")} className="profile-page"><ProfileWorkspace /></PageWrap>;
}

function ModesPage() {
  const setPage = useApp((s) => s.setPage),
    setMode = useApp((s) => s.setMode),
    settings = useApp((s) => s.settings);
  const [selectedGame, setSelectedGame] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<"all" | TrainingDifficultyId>("all");
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null);
  const filteredEntries = useMemo(
    () => rankTrainingCatalogForGame(
      filterTrainingCatalog(trainingCatalogEntries, { game: selectedGame, difficulty: selectedDifficulty }),
      selectedGame,
    ),
    [selectedGame, selectedDifficulty],
  );
  const difficultyGroups = useMemo(
    () => groupTrainingCatalogByDifficulty(filteredEntries),
    [filteredEntries],
  );
  const selectedGameLabel = selectedGame === "all" ? tx("全部游戏", "All games") : trainingGameLabels[selectedGame];
  const selectedTraining = selectedTrainingId
    ? trainingCatalogEntries.find((entry) => entry.id === selectedTrainingId) ?? null
    : null;
  const selectedTrainingCopy = selectedTraining ? getLocalizedTrainingCopy(selectedTraining) : null;

  useEffect(() => {
    if (!selectedTraining) return;
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousRootOverflow = root.style.overflow;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    const bodyPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.classList.add("training-detail-open");
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTrainingId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      body.classList.remove("training-detail-open");
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      root.style.overflow = previousRootOverflow;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, [selectedTraining]);

  return (
    <PageWrap title={tx("训练库", "Training library")} className="catalog-page">
      <section className="catalog-filter-panel" aria-label={tx("训练筛选", "Training filters")}>
        <div className="catalog-filter-heading">
          <div><Gamepad2 size={18} /><span><b>{tx("选择游戏", "Select game")}</b></span></div>
        </div>
        <div className="game-filter-layout">
          <div className="game-filter-grid">
            <button className={`catalog-all-game ${selectedGame === "all" ? "active" : ""}`} aria-pressed={selectedGame === "all"} onClick={() => setSelectedGame("all")}>
              <GameIcon gameId="all" /><span>{tx("全部", "All")}</span>{selectedGame === "all" && <Check size={14} />}
            </button>
            {trainingGames.map((game) => {
              return (
                <button key={game.id} className={selectedGame === game.id ? "active" : ""} aria-pressed={selectedGame === game.id} onClick={() => setSelectedGame(game.id)}>
                  <GameIcon gameId={game.id} /><span>{game.label}</span>{selectedGame === game.id && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="difficulty-filter">
          <span>{tx("训练阶段", "Training tier")}</span>
          <button className={selectedDifficulty === "all" ? "active" : ""} aria-pressed={selectedDifficulty === "all"} onClick={() => setSelectedDifficulty("all")}>{tx("全部", "All")}</button>
          {trainingDifficulties.map((difficulty) => (
            <button key={difficulty.id} className={selectedDifficulty === difficulty.id ? "active" : ""} aria-pressed={selectedDifficulty === difficulty.id} onClick={() => setSelectedDifficulty(difficulty.id)}>
              <i style={{ background: difficulty.color }} />{getTrainingDifficultyLabel(difficulty.id)}
            </button>
          ))}
          <b>{selectedGameLabel} · {tx("找到", "Found")} {filteredEntries.length} {tx("项", "drills")}</b>
        </div>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          className="catalog-results"
          key={`${selectedGame}-${selectedDifficulty}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: .2 }}
        >
          {difficultyGroups.map((group) => {
            const availableEntries = group.entries.filter((entry) => entry.available);
            const upcomingEntries = group.entries.filter((entry) => !entry.available);
            return (
            <section className="training-difficulty-section" key={group.id}>
              <header className="difficulty-section-header" style={{ "--difficulty-color": group.color } as React.CSSProperties}>
                <span className="difficulty-index">{group.code}</span>
                <div><h2>{getTrainingDifficultyLabel(group.id)} {tx("训练", "Drills")}</h2></div>
                <b>{group.entries.length} {tx("项", "drills")}</b>
              </header>
              {availableEntries.length > 0 && <div className="catalog-grid">
                {availableEntries.map((m) => {
                  const copy = getLocalizedTrainingCopy(m);
                  return (
                    <article className={`catalog-card ${m.available ? "available" : "coming-soon"}`} key={m.id} style={{ "--accent": m.color } as React.CSSProperties}>
                      <CatalogScenePreview training={m} settings={settings} />
                      <div className="catalog-card-copy">
                        <div className="catalog-card-labels">
                          <span>{getTrainingCategoryLabel(m.category)}</span>
                          <b><i /> {tx("可训练", "Playable")}</b>
                        </div>
                        <h3>{m.name}</h3>
                        <p>{copy.description}</p>
                        <div className="catalog-specs">
                          <span><small>{tx("时长", "Duration")}</small><b>{m.durationSec} {tx("秒", "sec")}</b></span>
                          <span><small>{tx("操作", "Input")}</small><b>{copy.inputStyle}</b></span>
                          <span><small>{tx("主要指标", "Primary metric")}</small><b>{copy.primaryMetric}</b></span>
                        </div>
                        <div className="catalog-basis"><small>{tx("训练重点", "Training focus")}</small><b>{copy.trainingBasis}</b></div>
                        <div className="mode-games">
                          {m.games.map((game) => <span className={game === selectedGame ? "matched" : ""} key={game}>{trainingGameLabels[game]}</span>)}
                        </div>
                        <div className="catalog-card-actions">
                          <button onClick={() => setSelectedTrainingId(m.id)}><Eye size={14} />{tx("查看详情", "View details")}</button>
                          {m.available && <button className="primary-card-action" onClick={() => {
                            if (!m.playableMode) return;
                            if (m.id === "grid-shot") {
                              openGridShotSession("benchmark");
                              return;
                            }
                            setMode(m.playableMode);
                            setPage("game");
                          }}>{tx("进入训练", "Enter training")} <ChevronRight size={15} /></button>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>}
              {upcomingEntries.length > 0 && (
                <details className="catalog-upcoming">
                  <summary><b>{tx("待开发", "Coming soon")}</b><span>{upcomingEntries.length} {tx("项", "drills")}</span><ChevronRight size={15} /></summary>
                  <div>
                    {upcomingEntries.map((training) => (
                      <button type="button" key={training.id} style={{ "--accent": training.color } as React.CSSProperties} onClick={() => setSelectedTrainingId(training.id)}>
                        <span><b>{training.name}</b><small>{getTrainingCategoryLabel(training.category)} · {tx("待开发", "Coming soon")}</small></span>
                        <em>{getLocalizedTrainingCopy(training).trainingBasis}</em>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </section>
            );
          })}
        </motion.div>
      </AnimatePresence>
      {createPortal(<AnimatePresence>
        {selectedTraining && selectedTrainingCopy && (
          <motion.div className="training-detail-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTrainingId(null);
          }}>
            <motion.aside className="training-detail-dialog" role="dialog" aria-modal="true" aria-label={`${selectedTraining.name} ${tx("训练详情", "training details")}`} initial={{ y: 18, scale: .975, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, scale: .985, opacity: 0 }} transition={{ duration: .2, ease: "easeOut" }}>
              <header>
                <div><small>{tx("训练简报", "Training brief")}</small><h2>{selectedTraining.name}</h2></div>
                <button aria-label={tx("关闭训练详情", "Close training details")} onClick={() => setSelectedTrainingId(null)}><X size={18} /></button>
              </header>
              <div className="training-detail-layout">
                <div className="training-detail-visual">
                  <CatalogScenePreview training={selectedTraining} settings={settings} large />
                  <div className="training-detail-summary">
                    <span><small>{tx("难度", "Tier")}</small><b>{getTrainingDifficultyLabel(selectedTraining.difficulty)}</b></span>
                    <span><small>{tx("操作", "Input")}</small><b>{selectedTrainingCopy.inputStyle}</b></span>
                    <span><small>{tx("时长", "Duration")}</small><b>{selectedTraining.durationSec} {tx("秒", "sec")}</b></span>
                    <span><small>{tx("主要指标", "Primary metric")}</small><b>{selectedTrainingCopy.primaryMetric}</b></span>
                  </div>
                </div>
                <div className="training-detail-content">
                  <section><small>{tx("训练目标", "Training goal")}</small><p>{selectedTrainingCopy.description}</p></section>
                  <section><small>{tx("训练规则", "Rules")}</small><p>{selectedTrainingCopy.method}</p></section>
                  <section><small>{tx("教练提示", "Coach cue")}</small><p>{selectedTrainingCopy.coachCue}</p></section>
                  <section className="training-game-fit"><small>{tx("游戏推荐理由", "Why it fits")}</small><div>{selectedTraining.games.map((game) => (
                    <span key={game}><b>{trainingGameLabels[game]}</b><em>{getTrainingGameFitReason(selectedTraining, game)}</em></span>
                  ))}</div></section>
                </div>
              </div>
              {selectedTraining.available && <footer>
                <button className="primary" onClick={() => {
                  if (!selectedTraining.playableMode) return;
                  if (selectedTraining.id === "grid-shot") {
                    openGridShotSession("benchmark");
                    return;
                  }
                  setMode(selectedTraining.playableMode);
                  setPage("game");
                }}>{tx("进入训练", "Enter training")} <ChevronRight size={16} /></button>
              </footer>}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </PageWrap>
  );
}

function CatalogScenePreview({ training, settings, large = false }: { training: TrainingCatalogEntry; settings: TrainingSettings; large?: boolean }) {
  const copy = getLocalizedTrainingCopy(training);
  if (training.available) {
    return (
      <div className={`catalog-scene-preview real grid-shot-settings-preview ${large ? "large" : ""}`}>
        <GridShotSettingsPreview settings={settings} />
      </div>
    );
  }
  return (
    <div className={`catalog-scene-preview pending ${large ? "large" : ""}`}>
      <Target size={large ? 32 : 22} />
      <span><b>{tx("场景筹备中", "Scene in development")}</b><em>{copy.targetForm}</em></span>
    </div>
  );
}

type TargetData = {
  id: number;
  pos: [number, number, number];
  born: number;
  vel: [number, number, number];
};
function Arena({
  targets,
  onHit,
  mode,
}: {
  targets: TargetData[];
  onHit: (id: number, ms: number) => void;
  mode: ModeId;
}) {
  const { camera, gl } = useThree();
  const refs = useRef(new Map<number, THREE.Mesh>());
  useEffect(() => {
    const shot = () => {
      if (document.pointerLockElement !== gl.domElement) {
        gl.domElement.requestPointerLock();
        return;
      }
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = ray.intersectObjects([...refs.current.values()]);
      if (hits[0]) {
        const id = [...refs.current].find(([, m]) => m === hits[0].object)?.[0];
        if (id !== undefined) onHit(id, performance.now());
      }
    };
    window.addEventListener("mousedown", shot);
    return () => {
      window.removeEventListener("mousedown", shot);
    };
  }, [camera, gl, onHit]);
  useFrame((_, d) => {
    if (mode === "tracking")
      refs.current.forEach((m, id) => {
        const t = targets.find((x) => x.id === id);
        if (t) {
          m.position.x += t.vel[0] * d;
          if (Math.abs(m.position.x) > 4.4) t.vel[0] *= -1;
        }
      });
  });
  return (
    <>
      <color attach="background" args={["#03070c"]} />
      <fog attach="fog" args={["#03070c", 9, 24]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 3, 2]} color="#65eaff" intensity={22} />
      <Grid
        position={[0, -3, -7]}
        args={[30, 30]}
        cellColor="#173344"
        sectionColor="#24536a"
        fadeDistance={18}
        infiniteGrid
      />
      <Sparkles
        count={useApp.getState().settings.lowSpec ? 12 : 45}
        scale={[14, 8, 8]}
        size={1}
        speed={0.18}
      />
      {targets.map((t) => (
        <mesh
          key={t.id}
          position={t.pos}
          ref={(m) => {
            if (m) refs.current.set(t.id, m);
            else refs.current.delete(t.id);
          }}
        >
          <sphereGeometry args={[mode === "reflex" ? 0.46 : 0.52, 24, 24]} />
          <meshStandardMaterial
            color="#bffaff"
            emissive={mode === "reflex" ? "#8d54ff" : "#1ccce0"}
            emissiveIntensity={2.3}
            roughness={0.25}
          />
          <pointLight color="#4eefff" intensity={2.5} distance={3} />
          <mesh scale={0.55}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial color="#ffffff" wireframe />
          </mesh>
        </mesh>
      ))}
    </>
  );
}
function LegacyGamePage() {
  const mode = useApp((s) => s.mode),
    settings = useApp((s) => s.settings),
    setPage = useApp((s) => s.setPage),
    save = useApp((s) => s.saveResult);
  const duration = 30,
    [time, setTime] = useState(duration),
    [score, setScore] = useState(0),
    [hits, setHits] = useState(0),
    [shots, setShots] = useState(0),
    [combo, setCombo] = useState(0),
    [bestCombo, setBestCombo] = useState(0),
    [reactions, setReactions] = useState<number[]>([]),
    [feedback, setFeedback] = useState(""),
    play = useMemo(() => AudioEngine(), []);
  const spawn = (id: number): TargetData => ({
    id,
    pos: [
      (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 4,
      -6 - Math.random() * 2,
    ],
    born: performance.now(),
    vel: [(Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random()), 0, 0],
  });
  const count = mode === "grid" ? 3 : 1,
    [targets, setTargets] = useState<TargetData[]>(() =>
      Array.from({ length: count }, (_, i) => spawn(i)),
    );
  const finish = () => {
    const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
    const r = {
      mode,
      score,
      hits,
      shots,
      accuracy,
      reaction: reactions.length
        ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
        : 0,
      combo: bestCombo,
      date: new Date().toISOString(),
    };
    save(r);
    document.exitPointerLock?.();
    setPage("results");
  };
  useEffect(() => {
    const t = setInterval(
      () =>
        setTime((x) => {
          if (x <= 1) {
            clearInterval(t);
            setTimeout(finish, 0);
            return 0;
          }
          return x - 1;
        }),
      1000,
    );
    return () => clearInterval(t);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- legacy trainer retained only for migration reference
  }, [score, hits, shots, bestCombo, reactions]);
  const hit = (id: number, now: number) => {
    setShots((x) => x + 1);
    const target = targets.find((t) => t.id === id);
    if (!target) return;
    const rt = now - target.born;
    const next = combo + 1;
    setHits((x) => x + 1);
    setCombo(next);
    setBestCombo((x) => Math.max(x, next));
    setReactions((x) => [...x, rt]);
    const points = Math.round(
      100 * Math.max(0.65, 1.35 - rt / 1800) * (1 + Math.min(next, 20) * 0.015),
    );
    setScore((x) => x + points);
    setFeedback(`+${points}  ${next > 5 ? `COMBO x${next}` : "HIT"}`);
    setTimeout(() => setFeedback(""), 350);
    play("hit");
    setTargets((ts) => ts.map((t) => (t.id === id ? spawn(t.id) : t)));
  };
  return (
    <div className="game">
      <Canvas
        dpr={[1, settings.lowSpec ? 1.2 : 1.75]}
        camera={{ fov: 82, position: [0, 0, 2] }}
      >
        <Arena targets={targets} onHit={hit} mode={mode} />
      </Canvas>
      <div className="game-top">
        <div>
          <small>SCORE</small>
          <b>{score.toLocaleString()}</b>
        </div>
        <div className="time">
          <Timer />
          00:{String(time).padStart(2, "0")}
        </div>
        <div>
          <small>ACCURACY</small>
          <b>{shots ? Math.round((hits / shots) * 100) : 100}%</b>
        </div>
      </div>
      <div className="game-side">
        <span>
          HITS <b>{hits}</b>
        </span>
        <span>
          COMBO <b>x{combo}</b>
        </span>
        <span>
          AVG RT{" "}
          <b>
            {reactions.length
              ? Math.round(
                  reactions.reduce((a, b) => a + b, 0) / reactions.length,
                )
              : 0}{" "}
            ms
          </b>
        </span>
      </div>
      <CrosshairUI />
      <AnimatePresence>
        {feedback && (
          <motion.div
            className="feedback"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="lock-hint">点击画面锁定鼠标 · ESC 暂停</div>
      <button className="game-exit" onClick={finish}>
        结束训练
      </button>
    </div>
  );
}
function GamePage() {
  const settings = useApp((s) => s.settings);
  const gridShotSettings = useApp((s) => s.gridShotSettings);
  const gridShotSessionType = useApp((s) => s.gridShotSessionType);
  const updateSettings = useApp((s) => s.updateSettings);
  const updateGridShotSettings = useApp((s) => s.updateGridShotSettings);
  const setGridShotSessionType = useApp((s) => s.setGridShotSessionType);
  const setPage = useApp((s) => s.setPage);
  const setGridResult = useApp((s) => s.setGridResult);
  const authStatus = useAuthStore((state) => state.status);
  return (
    <GridShotTrainingPage
      key={`${gridShotSessionType}:${gridShotSettings.duration}:${gridShotSettings.targetSize}`}
      settings={settings}
      gridShotSettings={gridShotSettings}
      sessionType={gridShotSessionType}
      onHome={() => setPage("home")}
      onApplySettings={updateSettings}
      onApplyGridShotSettings={updateGridShotSettings}
      onSessionTypeChange={(value) => {
        setGridShotSessionType(value);
        if (value === "benchmark") updateGridShotSettings(applyGridShotBenchmarkRules(useApp.getState().gridShotSettings));
      }}
      onResult={(record) => {
        setGridResult(record);
        setPage("results");
        persistGridShotResult(record, authStatus === "authenticated");
      }}
    />
  );
}

function GridShotQaPage() {
  const settings = useApp((state) => state.settings);
  const gridShotSettings = useApp((state) => state.gridShotSettings);
  const updateSettings = useApp((state) => state.updateSettings);
  const updateGridShotSettings = useApp((state) => state.updateGridShotSettings);
  const setPage = useApp((state) => state.setPage);
  const [record, setRecord] = useState<GridShotHistoryRecord>();
  const [run, setRun] = useState(0);
  if (record) return (
    <div className="shell focused-shell result-shell">
      <div className="ambient-stars" aria-hidden="true"><i /><i /><i /></div>
      <div className="page">
        <GridShotResultPage record={record} targetSize={gridShotSettings.targetSize} saveStatus="login-required" onAgain={() => { setRecord(undefined); setRun((value) => value + 1); }} onTrainingHome={() => setPage("modes")} onLoginToSave={() => undefined} />
      </div>
    </div>
  );
  return <GridShotTrainingPage key={run} qaMode settings={settings} gridShotSettings={gridShotSettings} sessionType="practice" onHome={() => setPage("home")} onApplySettings={updateSettings} onApplyGridShotSettings={updateGridShotSettings} onSessionTypeChange={() => undefined} onResult={(result) => setRecord(result)} />;
}

function CrosshairUI() {
  const s = useApp((x) => x.settings);
  return <TrainingCrosshair settings={s} />;
}

function LegacyResults() {
  const r = useApp((s) => s.results[0]),
    setPage = useApp((s) => s.setPage);
  if (!r) return null;
  const rank = r.accuracy > 92 ? "S+" : r.accuracy > 84 ? "A" : "B";
  return (
    <PageWrap title="训练结算">
      <div className="result-hero">
        <div>
          <span>本次评级</span>
          <strong>{rank}</strong>
          <small>精准执行</small>
        </div>
        <div>
          <span>FINAL SCORE</span>
          <h1>{r.score.toLocaleString()}</h1>
          <p>{trainingCatalogEntries.find((entry) => entry.playableMode === r.mode)?.name ?? "GRID SHOT"} · 30 SEC</p>
        </div>
      </div>
      <div className="result-grid">
        <Stat
          icon={Crosshair}
          label="准确率"
          value={`${r.accuracy}%`}
          hint={`${r.hits} / ${r.shots} 命中`}
        />
        <Stat
          icon={Zap}
          label="平均反应"
          value={`${r.reaction}ms`}
          hint="神经响应"
        />
        <Stat
          icon={Activity}
          label="最大连击"
          value={`x${r.combo}`}
          hint="稳定输出"
        />
        <Stat
          icon={Award}
          label="获得经验"
          value={`+${Math.round(r.score / 8)} XP`}
          hint="等级进度已保存"
        />
      </div>
      <div className="result-actions">
        <button onClick={() => setPage("game")} className="primary">
          再来一次
        </button>
        <button onClick={() => setPage("modes")}>返回训练列表</button>
      </div>
    </PageWrap>
  );
}
function LegacyEnhancedResults() {
  const current = useApp((s) => s.gridResult),
    previous = useApp((s) => s.previousGridResult),
    setPage = useApp((s) => s.setPage);
  const r = current;
  if (!r)
    return (
      <PageWrap title="训练结算">
        <button onClick={() => setPage("home")}>返回主页</button>
      </PageWrap>
    );
  const best = r.score,
    delta = previous ? r.score - previous.score : 0;
  return (
    <PageWrap title="训练结算">
      <div className="result-hero">
        <div>
          <span>本次评级</span>
          <strong>{r.grade}</strong>
          <small>{r.score >= best ? "NEW PERSONAL RECORD" : "精准执行"}</small>
        </div>
        <div>
          <span>FINAL SCORE</span>
          <h1>{r.score.toLocaleString()}</h1>
          <p>GRID SHOT · 60 SEC · 历史最高 {best.toLocaleString()}</p>
        </div>
      </div>
      <div className="result-grid">
        <Stat
          icon={Crosshair}
          label="准确率"
          value={`${r.accuracy.toFixed(1)}%`}
          hint={`${r.hits} 命中 / ${r.misses} 失误`}
        />
        <Stat
          icon={Zap}
          label="平均反应"
          value={`${Math.round(r.averageReactionTime)}ms`}
          hint={`最快 ${Math.round(r.fastestReactionTime)}ms`}
        />
        <Stat
          icon={Activity}
          label="最大连击"
          value={`x${r.maxCombo}`}
          hint={`${r.targetsPerMinute.toFixed(1)} 目标 / 分钟`}
        />
        <Stat
          icon={Award}
          label="较上次成绩"
          value={`${delta >= 0 ? "+" : ""}${delta}`}
          hint="本局训练结果"
        />
      </div>
      <section className="panel result-chart">
        <div className="panel-head">
          <h3>分数趋势</h3>
          <span>60 秒</span>
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={r.scoreTimeline}>
            <XAxis dataKey="time" stroke="#566375" />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "#0a121c",
                border: "1px solid #263849",
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#69efff"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>
      <div className="result-actions">
        <button onClick={() => setPage("game")} className="primary">
          再来一次
        </button>
        <button onClick={() => setPage("home")}>返回主页</button>
        <button onClick={() => setPage("modes")}>查看历史记录</button>
      </div>
    </PageWrap>
  );
}

function Results() {
  const record = useApp((state) => state.gridResult);
  const targetSize = useApp((state) => state.gridShotSettings.targetSize);
  const saveState = useApp((state) => state.gridSaveState);
  const setGridSaveState = useApp((state) => state.setGridSaveState);
  const setPage = useApp((state) => state.setPage);
  const authenticated = useAuthStore((state) => state.status === "authenticated");
  const currentSaveState = saveState.sessionId === record?.sessionId ? saveState : { status: "idle" as const };
  return (
    <GridShotResultPage
      record={record}
      targetSize={targetSize}
      saveStatus={currentSaveState.status}
      serverSessionId={currentSaveState.serverSessionId}
      onAgain={() => setPage("game")}
      onTrainingHome={() => setPage("modes")}
      onOpenSettings={() => setPage("settings")}
      onLoginToSave={currentSaveState.status === "login-required" ? () => {
        if (!record) return;
        setGridSaveState({ sessionId: record.sessionId, status: "login-required", loginRequested: true });
        setPage("profile");
      } : undefined}
      onRetrySave={authenticated && currentSaveState.status === "failed" && record
        ? () => persistGridShotResult(record, true)
        : undefined}
    />
  );
}
void LegacyEnhancedResults;
function LegacySettingsPage() {
  const s = useApp((x) => x.settings),
    update = useApp((x) => x.updateSettings);
  const canonical = createNeonInputSensitivity(s),
    systemDpr = window.devicePixelRatio || 1,
    renderDpr = Math.min(systemDpr, s.lowSpec ? 1.25 : 2);
  return (
    <PageWrap title="系统设置">
      <div className="settings-grid">
        <Panel title="鼠标与视野" action="INPUT">
          <Slider
            label="水平 / 垂直灵敏度"
            value={s.sensitivity}
            min={0.1}
            max={1.5}
            step={0.05}
            onChange={(v) => update({ sensitivity: v })}
          />
          <label>
            灵敏度精确值
            <input
              type="number"
              min="0.1"
              max="1.5"
              step="0.01"
              value={s.sensitivity}
              onChange={(e) =>
                update({
                  sensitivity: Math.max(
                    0.1,
                    Math.min(1.5, Number(e.target.value)),
                  ),
                })
              }
            />
          </label>
          <label>
            鼠标 DPI
            <input
              type="number"
              min="100"
              max="32000"
              step="50"
              value={s.mouseDpi}
              onChange={(e) =>
                update({
                  mouseDpi: Math.max(
                    100,
                    Math.min(32000, Number(e.target.value)),
                  ),
                })
              }
            />
          </label>
          <Slider
            label="垂直灵敏度比例"
            value={s.verticalRatio}
            min={0.1}
            max={2}
            step={0.05}
            onChange={(v) => update({ verticalRatio: v })}
          />
          <div className="sensitivity-readout">
            <span>
              cm / 360<b>{canonical.cmPer360.toFixed(2)} cm</b>
            </span>
            <span>
              eDPI<b>{Math.round(s.mouseDpi * s.sensitivity)}</b>
            </span>
            <span>
              弧度 / Count
              <b>{canonical.radiansPerMouseCount.toExponential(3)}</b>
            </span>
          </div>
          <label className="toggle">
            反转 Y 轴
            <span
              className={s.invertY ? "on" : ""}
              onClick={() => update({ invertY: !s.invertY })}
            >
              <i />
            </span>
          </label>
        </Panel>
        <Panel title="准星校准" action="RETICLE">
          <div className="cross-preview">
            <CrosshairUI />
          </div>
          <label>
            准星颜色
            <input
              type="color"
              value={s.crosshairColor}
              onChange={(e) => update({ crosshairColor: e.target.value })}
            />
          </label>
          <div className="segmented">
            {CROSSHAIR_PRESETS.slice(0, 4).map((preset) => (
              <button
                className={matchCrosshairPreset(s) === preset.id ? "active" : ""}
                onClick={() => update(preset.parameters)}
                key={preset.id}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Slider
            label="准星粗细"
            value={s.crosshairThickness}
            min={1}
            max={4}
            step={1}
            onChange={(v) => update({ crosshairThickness: v })}
          />
          <Slider
            label="准星长度"
            value={s.crosshairLength}
            min={3}
            max={16}
            step={1}
            onChange={(v) => update({ crosshairLength: v })}
          />
          <Slider
            label="中心间距"
            value={s.crosshairGap}
            min={2}
            max={12}
            step={1}
            onChange={(v) => update({ crosshairGap: v })}
          />
          <Slider
            label="准星透明度"
            value={s.crosshairOpacity}
            min={0.25}
            max={1}
            step={0.05}
            onChange={(v) => update({ crosshairOpacity: v })}
          />
        </Panel>
        <Panel
          title="音频"
          action={(<Volume2 size={14} />) as unknown as string}
        >
          <Slider
            label="总音量"
            value={s.volume}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update({ volume: v })}
          />
          <label className="toggle">
            静音
            <span
              className={s.muted ? "on" : ""}
              onClick={() => update({ muted: !s.muted })}
            >
              <i />
            </span>
          </label>
        </Panel>
        <Panel
          title="画面性能"
          action={(<Gauge size={14} />) as unknown as string}
        >
          <label className="toggle">
            低配模式
            <span
              className={s.lowSpec ? "on" : ""}
              onClick={() => update({ lowSpec: !s.lowSpec })}
            >
              <i />
            </span>
          </label>
          <p className="muted">
            降低像素比、粒子数量与环境复杂度，以稳定帧率。
          </p>
          <div className="sensitivity-readout">
            <span>
              窗口 CSS
              <b>
                {innerWidth} × {innerHeight}
              </b>
            </span>
            <span>
              系统 / 有效 DPR
              <b>
                {systemDpr.toFixed(2)} / {renderDpr.toFixed(2)}
              </b>
            </span>
            <span>
              实际渲染
              <b>
                {Math.round(innerWidth * renderDpr)} ×{" "}
                {Math.round(innerHeight * renderDpr)}
              </b>
            </span>
            <span>
              总像素
              <b>
                {(
                  (innerWidth * innerHeight * renderDpr * renderDpr) /
                  1e6
                ).toFixed(2)}{" "}
                MP
              </b>
            </span>
          </div>
        </Panel>
      </div>
    </PageWrap>
  );
}
void LegacyGamePage;
void LegacyResults;
void LegacySettingsPage;
function SettingsPage(){const settings=useApp(s=>s.settings),update=useApp(s=>s.updateSettings);return <SettingsWorkspace settings={settings} onApply={update}/>}
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span>
        {label}
        <b>{value}</b>
      </span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function AccountAccessPage() {
  const setPage = useApp((state) => state.setPage);
  return (
    <main className="account-access-page">
      <header className="account-access-header">
        <div className="account-access-brand"><BrandGlyph /><span>NEON <b>AIM</b></span></div>
        <button className="account-access-back" onClick={() => setPage("home")}><ArrowLeft size={16} />{tx("返回大厅", "Back to lobby")}</button>
      </header>
      <div className="account-access-content"><ProfileWorkspace /></div>
    </main>
  );
}

function App() {
  const page = useApp((s) => s.page);
  const settings = useApp((s) => s.settings);
  const language = settings.language;
  const gridShotSettings = useApp((s) => s.gridShotSettings);
  const gridShotSessionType = useApp((s) => s.gridShotSessionType);
  const careerTargetSize = useApp((s) => s.gridShotSettings.targetSize);
  const setPage = useApp((s) => s.setPage);
  const applyAccountPreferences = useApp((s) => s.applyAccountPreferences);
  const restoreGuestPreferences = useApp((s) => s.restoreGuestPreferences);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const authStatus = useAuthStore((s) => s.status);
  const authUserId = useAuthStore((s) => s.user?.id);
  const previousAuthStatus = useRef(authStatus);
  const reduceMotion = useReducedMotion();
  const accountPreferences = useMemo(
    () => createAccountPreferenceDocument(settings, gridShotSettings, gridShotSessionType),
    [gridShotSessionType, gridShotSettings, settings],
  );
  useAccountPreferencesSync({
    authenticated: authStatus === "authenticated",
    userId: authUserId,
    document: accountPreferences,
    applyRemote: applyAccountPreferences,
  });
  useInterfaceAudioFeedback(page !== "game" && page !== "qa");
  setAppLanguage(language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    clearRetiredLocalTrainingData();
    void initializeAuth();
  }, [initializeAuth]);
  useEffect(() => {
    if (authStatus !== "offline") return;
    const retry = () => void initializeAuth();
    const timer = window.setInterval(retry, 3000);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [authStatus, initializeAuth]);
  useEffect(() => {
    const previous = previousAuthStatus.current;
    previousAuthStatus.current = authStatus;
    if (previous !== "authenticated" || authStatus === "authenticated") return;
    useApp.getState().setGridResult(undefined);
    useApp.getState().setGridSaveState({ status: "idle" });
    restoreGuestPreferences();
  }, [authStatus, restoreGuestPreferences]);
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const app = useApp.getState();
    const pending = app.gridSaveState;
    const record = app.gridResult;
    if (!record || !pending.loginRequested || pending.status !== "login-required" || pending.sessionId !== record.sessionId) return;
    app.setPage("results");
    persistGridShotResult(record, true);
  }, [authStatus]);
  useEffect(() => {
    if (page === "profile") window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [authStatus, page]);
  useEffect(() => {
    const restorePageFromHistory = () => useApp.setState({ page: pathPage() });
    window.addEventListener("popstate", restorePageFromHistory);
    return () => window.removeEventListener("popstate", restorePageFromHistory);
  }, []);
  if (page === "boot") return <Boot />;
  if (page === "game") return <GamePage />;
  if (page === "qa" && import.meta.env.DEV) return <GridShotQaPage />;
  if (page === "profile" && authStatus !== "authenticated") return <AccountAccessPage />;
  const focusedPage = page === "settings" || page === "results";
  const showTopbar = page !== "results";
  return (
    <div className={["shell", focusedPage ? "focused-shell" : "", page === "results" ? "result-shell" : "", showTopbar ? "has-topbar" : ""].filter(Boolean).join(" ")}>
      <div className="ambient-stars" aria-hidden="true"><i /><i /><i /></div>
      <BrowserFrameMonitor />
      {showTopbar && <TopNavigation />}
      <AnimatePresence mode="wait">
        <motion.div
          className="page"
          key={page}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: .995, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 1.002, filter: "blur(3px)" }}
          transition={{ duration: reduceMotion ? .12 : .32, ease: [0.22, 0.72, 0.24, 1] }}
        >
          {page === "home" ? (
            <HomePage />
          ) : page === "modes" ? (
            <ModesPage />
          ) : page === "progress" ? (
            <CareerPage
              key={authUserId ?? authStatus}
              projectSettings={{ "grid-shot": { targetSize: careerTargetSize } }}
              onStartTraining={(projectId, entryId) => {
                if (projectId === "grid-shot") openGridShotSession(entryId === "benchmark" ? "benchmark" : "practice");
                else setPage("modes");
              }}
              onBrowseTraining={() => setPage("modes")}
              onLogin={() => setPage("profile")}
            />
          ) : page === "workshop" || page === "ranking" ? (
            <FutureHubPage kind={page} />
          ) : page === "profile" ? (
            <ProfilePage />
          ) : page === "settings" ? (
            <SettingsPage />
          ) : (
            <Results />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
export default App;
