import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Sparkles } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Award,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Cloud,
  Crosshair,
  Gamepad2,
  Gauge,
  Home,
  LockKeyhole,
  Eye,
  Settings,
  Target,
  Timer,
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
import * as THREE from "three";
import { create } from "zustand";
import { GridShotTrainingPage } from "./pages/GridShotTrainingPage";
import type {
  GridShotHistoryRecord,
  TrainingSettings,
} from "./game/types/training";
import { readHistory } from "./game/storage/trainingStorage";
import {
  createNeonInputSensitivity,
  normalizeNeonInputSettings,
} from "./game/sensitivity/sensitivity";
import { BrowserFrameMonitor } from "./game/performance/PerformanceMonitor";
import { usePerformanceStore } from "./game/performance/performanceStore";
import { DEFAULT_TRAINING_SETTINGS } from "./game/settings/trainingSettings";
import { SettingsWorkspace } from "./pages/SettingsWorkspace";
import { GridShotResultPage } from "./pages/GridShotResultPage";
import { GridShotSettingsPreview } from "./components/training/GridShotSettingsPreview";
import { GameIcon } from "./components/GameIcon";
import {
  filterTrainingCatalog,
  getTrainingGameFitReason,
  groupTrainingCatalogByDifficulty,
  rankTrainingCatalogForGame,
  trainingCatalogEntries,
  trainingCategories,
  trainingDifficulties,
  trainingGameLabels,
  trainingGameProfiles,
  trainingGames,
  type TrainingCatalogEntry,
  type TrainingDifficultyId,
} from "./game/trainingCatalog";
import "./App.css";

type ModeId = "grid" | "reflex" | "tracking";
type Page = "boot" | "home" | "modes" | "game" | "results" | "settings" | "qa";
type SettingsData = TrainingSettings;
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
  results: Result[];
  gridResult?: GridShotHistoryRecord;
  previousGridResult?: GridShotHistoryRecord;
  setPage: (p: Page) => void;
  setMode: (m: ModeId) => void;
  updateSettings: (v: Partial<SettingsData>) => void;
  saveResult: (r: Result) => void;
  setGridResult: (r: GridShotHistoryRecord, p?: GridShotHistoryRecord) => void;
};
const initialSettings: SettingsData = DEFAULT_TRAINING_SETTINGS;
const load = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
};
const loadedSettings: SettingsData = {
  ...initialSettings,
  ...load<Partial<SettingsData>>("neon-settings", {}),
};
const normalizedLoadedSettings: SettingsData = {
  ...loadedSettings,
  ...normalizeNeonInputSettings(loadedSettings),
};
const pathPage = (): Page =>
  import.meta.env.DEV && location.pathname.startsWith("/dev/grid-shot-qa")
    ? "qa"
    : location.pathname.startsWith("/training/grid-shot")
    ? "game"
    : location.pathname.startsWith("/training")
      ? "modes"
    : location.pathname.startsWith("/results/grid-shot")
      ? "results"
      : location.pathname.startsWith("/settings")
        ? "settings"
        : "boot";
const pagePath: Record<Page, string> = {
  boot: "/",
  home: "/",
  modes: "/training",
  game: "/training/grid-shot",
  results: "/results/grid-shot",
  settings: "/settings",
  qa: "/dev/grid-shot-qa",
};
const useApp = create<AppState>((set) => ({
  page: pathPage(),
  mode: "grid",
  settings: normalizedLoadedSettings,
  results: load("neon-results", []),
  setPage: (page) => {
    history.pushState({}, "", pagePath[page]);
    set({ page });
  },
  setMode: (mode) => set({ mode }),
  updateSettings: (v) =>
    set((s) => {
      const merged = { ...s.settings, ...v };
      const settings = { ...merged, ...normalizeNeonInputSettings(merged) };
      localStorage.setItem("neon-settings", JSON.stringify(settings));
      return { settings };
    }),
  saveResult: (r) =>
    set((s) => {
      const results = [r, ...s.results].slice(0, 30);
      localStorage.setItem("neon-results", JSON.stringify(results));
      return { results };
    }),
  setGridResult: (gridResult, previousGridResult) =>
    set({ gridResult, previousGridResult }),
}));

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
      <p>PRECISION TRAINING SYSTEM</p>
      <div className="boot-status">
        <span>
          {n < 35
            ? "校准训练环境"
            : n < 70
              ? "加载目标系统"
              : "同步本地训练数据"}
        </span>
        <em>{n}%</em>
      </div>
      <div className="progress">
        <i style={{ width: `${n}%` }} />
      </div>
      <button onClick={() => setPage("home")}>跳过初始化</button>
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

function Nav() {
  const page = useApp((s) => s.page),
    setPage = useApp((s) => s.setPage);
  return (
    <aside>
      <div className="logo">
        <BrandGlyph />
        <span>
          NEON <b>AIM</b>
        </span>
      </div>
      <nav>
        {[
          ["home", Home, "首页"],
          ["modes", Target, "训练"],
          ["settings", Settings, "设置"],
        ].map(([id, Icon, label]) => (
          <button
            key={id as string}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id as Page)}
          >
            <Icon size={18} />
            <span>{label as string}</span>
          </button>
        ))}
      </nav>
      <div className="profile">
        <div>NA</div>
        <span>
          <b>本地档案</b>
          <small>准备开始训练</small>
        </span>
      </div>
    </aside>
  );
}

function HomePage() {
  const setPage = useApp((s) => s.setPage);
  return (
    <PageWrap title="首页" sub="TRAINING OVERVIEW">
      <section className="hero">
        <div>
          <span className="eyebrow">GRID SHOT · READY</span>
          <h1>
            把每一枪，
            <br />
            <b>练得更稳。</b>
          </h1>
          <p>从看清目标、停稳准星开始，在 60 秒里找到准确与速度的平衡。</p>
          <button className="primary" onClick={() => setPage("game")}>
            <Crosshair size={19} />
            开始训练
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="orb">
          <div />
          <span>
            READY<small>校准完成</small>
          </span>
        </div>
      </section>
      <section className="cloud-data-notice">
        <div><Cloud size={22} /><span><small>TRAINING PROFILE</small><h3>训练档案即将开放</h3></span></div>
        <p>账号系统上线后，这里将统一展示个人最佳、成绩趋势和训练建议。当前首页不建立临时统计档案。</p>
        <b>功能仍在准备中</b>
      </section>
      <section className="roadmap-section">
        <div className="roadmap-heading"><div><small>NEXT MODULES</small><h3>未来功能</h3></div><span>功能仍在准备中</span></div>
        <div className="roadmap-grid">
          <FutureFeature icon={Bot} title="AI 教练" description="根据单局表现生成训练建议与复盘重点。" />
          <FutureFeature icon={CalendarDays} title="训练计划" description="根据目标和可用时间安排每日训练内容。" />
          <FutureFeature icon={Award} title="成就系统" description="记录里程碑、挑战进度和长期成长。" />
          <FutureFeature icon={Cloud} title="云端档案" description="跨设备同步设置、成绩和训练记录。" />
        </div>
      </section>
    </PageWrap>
  );
}
function PageWrap({
  title,
  sub,
  children,
  className,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  className?: string;
}) {
  const metrics = usePerformanceStore((s) => s.metrics);
  return (
    <main className={className}>
      <header>
        <div>
          <small>{sub}</small>
          <h2>{title}</h2>
        </div>
        <div className="status">
          <i /> 本地就绪{" "}
          <span>
            {metrics.average1s > 0
              ? `${Math.round(metrics.average1s)} FPS · ${metrics.frameTime.toFixed(1)} ms`
              : "性能检测中"}
          </span>
        </div>
      </header>
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
function FutureFeature({ icon: Icon, title, description }: { icon: typeof Zap; title: string; description: string }) {
  return (
    <motion.article className="future-feature" whileHover={{ y: -4 }}>
      <span><Icon size={19} /></span>
      <small>功能仍在准备中</small>
      <h4>{title}</h4>
      <p>{description}</p>
    </motion.article>
  );
}

function ModesPage() {
  const setPage = useApp((s) => s.setPage),
    setMode = useApp((s) => s.setMode),
    results = useApp((s) => s.results),
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
  const selectedGameLabel = selectedGame === "all" ? "全部游戏" : trainingGameLabels[selectedGame];
  const selectedGameProfile = selectedGame === "all" ? null : trainingGameProfiles[selectedGame];
  const selectedTraining = selectedTrainingId
    ? trainingCatalogEntries.find((entry) => entry.id === selectedTrainingId) ?? null
    : null;

  useEffect(() => {
    if (!selectedTraining) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedTrainingId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedTraining]);

  return (
    <PageWrap title="训练" sub="TRAINING CATALOG" className="catalog-page">
      <div className="catalog-status-strip">
        <p>选择常玩的游戏，查看更贴近其击杀节奏、目标运动和交战距离的训练建议。</p>
        <span><b>{trainingCatalogEntries.length}</b> 项训练</span>
        <span><b>{trainingGames.length}</b> 套游戏推荐</span>
      </div>

      <section className="catalog-filter-panel" aria-label="训练筛选">
        <div className="catalog-filter-heading">
          <div><Gamepad2 size={18} /><span><small>GAME RECOMMENDATION</small><b>你主要玩哪款游戏？</b></span></div>
          <p>{selectedGameProfile ? `${selectedGameProfile.ttkLabel}：建议优先训练${selectedGameProfile.focus}。同一难度内已按相关度排序。` : "选择一款游戏查看专项建议；推荐依据包括击杀时间、目标运动、交战距离和武器操作。"}</p>
        </div>
        <div className="game-filter-layout">
          <button className={`catalog-all-game ${selectedGame === "all" ? "active" : ""}`} aria-pressed={selectedGame === "all"} onClick={() => setSelectedGame("all")}>
            <GameIcon gameId="all" /><span>全部训练<small>{trainingCatalogEntries.length} 项</small></span>{selectedGame === "all" && <Check size={14} />}
          </button>
          <div className="game-filter-grid">
            {trainingGames.map((game) => {
              const count = trainingCatalogEntries.filter((entry) => entry.games.includes(game.id)).length;
              return (
                <button key={game.id} className={selectedGame === game.id ? "active" : ""} aria-pressed={selectedGame === game.id} onClick={() => setSelectedGame(game.id)}>
                  <GameIcon gameId={game.id} /><span>{game.label}<small>{count} 项推荐</small></span>{selectedGame === game.id && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="difficulty-filter">
          <span>训练阶段</span>
          <button className={selectedDifficulty === "all" ? "active" : ""} aria-pressed={selectedDifficulty === "all"} onClick={() => setSelectedDifficulty("all")}>全部</button>
          {trainingDifficulties.map((difficulty) => (
            <button key={difficulty.id} className={selectedDifficulty === difficulty.id ? "active" : ""} aria-pressed={selectedDifficulty === difficulty.id} onClick={() => setSelectedDifficulty(difficulty.id)}>
              <i style={{ background: difficulty.color }} />{difficulty.label}
            </button>
          ))}
          <b>{selectedGameLabel} · 找到 {filteredEntries.length} 项</b>
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
          {difficultyGroups.map((group) => (
            <section className="training-difficulty-section" key={group.id}>
              <header className="difficulty-section-header" style={{ "--difficulty-color": group.color } as React.CSSProperties}>
                <span className="difficulty-index">{group.code}</span>
                <div><small>{group.eyebrow}</small><h2>{group.label}训练</h2></div>
                <p>{group.description}</p>
                <b>{group.entries.length} 项</b>
              </header>
              <div className="catalog-grid">
                {group.entries.map((m) => {
                  const best = m.playableMode ? Math.max(0, ...results.filter((r) => r.mode === m.playableMode).map((r) => r.score)) : 0;
                  return (
                    <article className={`catalog-card ${m.available ? "available" : "coming-soon"}`} key={m.id} style={{ "--accent": m.color } as React.CSSProperties}>
                      <CatalogScenePreview training={m} settings={settings} />
                      <div className="catalog-card-labels">
                        <span>{m.code} · {trainingCategories[m.category].label}</span>
                        <b>{m.available ? <><i /> 已开放</> : <><LockKeyhole size={11} /> 待开发</>}</b>
                      </div>
                      <h3>{m.name}</h3>
                      <p>{m.description}</p>
                      <div className="catalog-specs">
                        <span><small>时长</small><b>{m.durationSec} 秒</b></span>
                        <span><small>操作</small><b>{m.inputStyle}</b></span>
                        <span><small>主要指标</small><b>{m.primaryMetric}</b></span>
                      </div>
                      <div className="catalog-basis"><small>训练重点</small><b>{m.trainingBasis}</b></div>
                      <div className="mode-games">
                        {m.games.map((game) => <span className={game === selectedGame ? "matched" : ""} key={game}>{trainingGameLabels[game]}</span>)}
                      </div>
                      <div className="catalog-card-actions">
                        <button onClick={() => setSelectedTrainingId(m.id)}><Eye size={14} />查看详情</button>
                        {m.available && <button className="primary-card-action" onClick={() => {
                          if (!m.playableMode) return;
                          setMode(m.playableMode);
                          setPage("game");
                        }}>开始训练 <ChevronRight size={15} /></button>}
                      </div>
                      {m.available && <small className="catalog-best">历史最佳 {best || "—"}</small>}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {selectedTraining && (
          <motion.div className="training-detail-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTrainingId(null);
          }}>
            <motion.aside className="training-detail-drawer" role="dialog" aria-modal="true" aria-label={`${selectedTraining.name} 训练详情`} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ duration: .22 }}>
              <header>
                <div><small>{selectedTraining.code} · {trainingCategories[selectedTraining.category].eyebrow}</small><h2>{selectedTraining.name}</h2></div>
                <button aria-label="关闭训练详情" onClick={() => setSelectedTrainingId(null)}><X size={18} /></button>
              </header>
              <CatalogScenePreview training={selectedTraining} settings={settings} large />
              <div className="training-detail-summary">
                <span><small>难度</small><b>{trainingDifficulties.find((item) => item.id === selectedTraining.difficulty)?.label}</b></span>
                <span><small>操作</small><b>{selectedTraining.inputStyle}</b></span>
                <span><small>时长</small><b>{selectedTraining.durationSec} 秒</b></span>
                <span><small>主要指标</small><b>{selectedTraining.primaryMetric}</b></span>
              </div>
              <section><small>训练目标</small><p>{selectedTraining.description}</p></section>
              <section><small>训练规则</small><p>{selectedTraining.method}</p></section>
              <section><small>教练提示</small><p>{selectedTraining.coachCue}</p></section>
              <section className="training-game-fit"><small>游戏推荐理由</small><div>{selectedTraining.games.map((game) => (
                <span key={game}><b>{trainingGameLabels[game]}</b><em>{getTrainingGameFitReason(selectedTraining, game)}</em></span>
              ))}</div></section>
              {selectedTraining.available && <footer>
                <button className="primary" onClick={() => {
                  if (!selectedTraining.playableMode) return;
                  setMode(selectedTraining.playableMode);
                  setPage("game");
                }}>进入正式训练 <ChevronRight size={16} /></button>
              </footer>}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrap>
  );
}

function CatalogScenePreview({ training, settings, large = false }: { training: TrainingCatalogEntry; settings: TrainingSettings; large?: boolean }) {
  if (training.available) {
    return (
      <div className={`catalog-scene-preview real grid-shot-settings-preview ${large ? "large" : ""}`}>
        <GridShotSettingsPreview settings={settings} />
        <span>GRID SHOT · 正式场景实时预览</span>
      </div>
    );
  }
  return (
    <div className={`catalog-scene-preview pending ${large ? "large" : ""}`}>
      <Target size={large ? 32 : 22} />
      <span><small>SCENE PREVIEW</small><b>暂无场景预览</b><em>{training.targetForm} · 待开发</em></span>
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
        camera={{ fov: settings.fov, position: [0, 0, 2] }}
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
  const setPage = useApp((s) => s.setPage);
  const setGridResult = useApp((s) => s.setGridResult);
  return (
    <GridShotTrainingPage
      settings={settings}
      onHome={() => setPage("home")}
      onSettings={() => setPage("settings")}
      onResult={(record, previous) => {
        setGridResult(record, previous);
        setPage("results");
      }}
    />
  );
}

function GridShotQaPage() {
  const settings = useApp((state) => state.settings);
  const setPage = useApp((state) => state.setPage);
  const [record, setRecord] = useState<GridShotHistoryRecord>();
  const [run, setRun] = useState(0);
  if (record) return <GridShotResultPage record={record} onAgain={() => { setRecord(undefined); setRun((value) => value + 1); }} onHome={() => setPage("home")} onModes={() => setPage("modes")} />;
  return <GridShotTrainingPage key={run} qaMode settings={settings} onHome={() => setPage("home")} onSettings={() => setPage("settings")} onResult={(result) => setRecord(result)} />;
}

function CrosshairUI() {
  const s = useApp((x) => x.settings);
  return (
    <div
      className={`crosshair ${s.crosshair}`}
      style={{ "--c": s.crosshairColor } as React.CSSProperties}
    >
      <i />
      <i />
      <i />
      <i />
      <b />
    </div>
  );
}

function LegacyResults() {
  const r = useApp((s) => s.results[0]),
    setPage = useApp((s) => s.setPage);
  if (!r) return null;
  const rank = r.accuracy > 92 ? "S+" : r.accuracy > 84 ? "A" : "B";
  return (
    <PageWrap title="训练结算" sub="SIMULATION COMPLETE">
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
  const r = current ?? readHistory()[0];
  if (!r)
    return (
      <PageWrap title="训练结算" sub="NO SESSION">
        <button onClick={() => setPage("home")}>返回主页</button>
      </PageWrap>
    );
  const best = Math.max(...readHistory().map((x) => x.score)),
    delta = previous ? r.score - previous.score : 0;
  return (
    <PageWrap title="训练结算" sub="SIMULATION COMPLETE">
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
          hint="成绩已保存到本机"
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

function Results(){const record=useApp(s=>s.gridResult),setPage=useApp(s=>s.setPage);return <GridShotResultPage record={record} onAgain={()=>setPage('game')} onHome={()=>setPage('home')} onModes={()=>setPage('modes')}/>}
void LegacyEnhancedResults;
function LegacySettingsPage() {
  const s = useApp((x) => x.settings),
    update = useApp((x) => x.updateSettings);
  const canonical = createNeonInputSensitivity(s),
    systemDpr = window.devicePixelRatio || 1,
    renderDpr = Math.min(systemDpr, s.lowSpec ? 1.25 : 2);
  return (
    <PageWrap title="系统设置" sub="CALIBRATION PANEL">
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
          <label>
            回报率
            <select
              value={s.pollingRate}
              onChange={(e) => update({ pollingRate: Number(e.target.value) })}
            >
              {[125, 250, 500, 1000, 2000, 4000, 8000].map((v) => (
                <option key={v} value={v}>
                  {v} Hz
                </option>
              ))}
            </select>
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
          <Slider
            label="视野范围 FOV"
            value={s.fov}
            min={60}
            max={110}
            step={1}
            onChange={(v) => update({ fov: v })}
          />
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
            {["cross", "dot", "circle"].map((v) => (
              <button
                className={s.crosshair === v ? "active" : ""}
                onClick={() => update({ crosshair: v })}
                key={v}
              >
                {v}
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
          <label className="toggle">
            显示命中标记
            <span
              className={s.showHitMarker ? "on" : ""}
              onClick={() => update({ showHitMarker: !s.showHitMarker })}
            >
              <i />
            </span>
          </label>
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
function App() {
  const page = useApp((s) => s.page);
  if (page === "boot") return <Boot />;
  if (page === "game") return <GamePage />;
  if (page === "qa" && import.meta.env.DEV) return <GridShotQaPage />;
  return (
    <div className="shell">
      <div className="ambient-stars" aria-hidden="true"><i /><i /><i /></div>
      <BrowserFrameMonitor />
      <Nav />
      <AnimatePresence mode="wait">
        <motion.div
          className="page"
          key={page}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
        >
          {page === "home" ? (
            <HomePage />
          ) : page === "modes" ? (
            <ModesPage />
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
