import { Canvas } from "@react-three/fiber";
import { Home, Play, RotateCcw, Settings as SettingsIcon, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GridShotArenaScene,
  type GridShotInputLifecycle,
  type GridShotSceneApi,
  type GridShotShotMetadata,
  type SceneDiagnostics,
} from "../components/training/GridShotArenaScene";
import { TrainingCrosshair } from "../components/training/Crosshair";
import { TrainingHud } from "../components/training/TrainingHud";
import { GridShotModeSettingsPanel } from "../components/training/GridShotModeSettingsPanel";
import { SettingsWorkspace } from "./SettingsWorkspace";
import { AudioManager, countdownWarningSeconds } from "../game/audio/AudioManager";
import { CanvasPerformanceMonitor, RenderScheduler } from "../game/performance/PerformanceMonitor";
import { usePerformanceStore } from "../game/performance/performanceStore";
import { GRID_SHOT_QA_DURATION } from "../game/qa/gridShotQa";
import { getGridShotScene, getGridShotTargetSize, type GridShotModeSettings } from "../game/modes/gridShot/gridShotConfig";
import type {
  PointerInputDebugSnapshot,
  PointerInputMode,
} from "../game/input/PointerLockInputController";
import { requestRawPointerLock } from "../game/input/PointerLockInputController";
import {
  applyGridShotHit,
  applyGridShotMiss,
  createEmptyGridShotStats,
  createGridShotRecord,
  refreshGridShotStats,
} from "../game/scoring/gridShotSession";
import {
  beginFinish,
  claimResultNavigation,
  claimResultSave,
  completeFinish,
  createTrainingSessionMachine,
  pauseSession,
  resetSession,
  resumeSession,
  startCountdown as transitionToCountdown,
  startSession as transitionToPlaying,
  type PauseReason,
  type TrainingSessionMachine,
  type TransitionResult,
} from "../game/session/trainingStateMachine";
import type { GridShotHistoryRecord, GridShotSessionStats, TrainingSettings, TrainingState } from "../game/types/training";
import "../game/session/finish.css";

const QA_DURATION = GRID_SHOT_QA_DURATION;
const COMBO_MILESTONES = [10, 20, 30, 50];

type FeedbackSlot = {
  id: number;
  active: boolean;
  score: number;
  label: string;
  interval: number | null;
  combo: number;
  stable: boolean;
};

const emptyFeedbackSlots = (): FeedbackSlot[] => Array.from({ length: 4 }, (_, id) => ({
  id,
  active: false,
  score: 0,
  label: "",
  interval: null,
  combo: 0,
  stable: false,
}));

type GridShotTrainingPageProps = {
  settings: TrainingSettings;
  gridShotSettings: GridShotModeSettings;
  onHome: () => void;
  onApplySettings: (value: Partial<TrainingSettings>) => void;
  onApplyGridShotSettings: (value: Partial<GridShotModeSettings>) => void;
  onResult: (record: GridShotHistoryRecord) => void;
  qaMode?: boolean;
};

export function GridShotTrainingPage({ settings, gridShotSettings, onHome, onApplySettings, onApplyGridShotSettings, onResult, qaMode = false }: GridShotTrainingPageProps) {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const devVisual = import.meta.env.DEV && query.get("devVisual") === "1";
  const devEndSession = import.meta.env.DEV && query.get("devEndSession") === "1";
  const debugInput = import.meta.env.DEV && query.get("debugInput") === "1";
  const visualMode = qaMode || devVisual;
  const duration = qaMode ? QA_DURATION : devVisual ? 30 : devEndSession ? 3 : gridShotSettings.duration;
  const activeScene = getGridShotScene(gridShotSettings.sceneId);
  const activeTargetSize = getGridShotTargetSize(gridShotSettings.targetSize);

  const machineRef = useRef<TrainingSessionMachine>(createTrainingSessionMachine(crypto.randomUUID()));
  const statsRef = useRef(createEmptyGridShotStats(machineRef.current.sessionId, duration));
  const [trainingState, setTrainingState] = useState<TrainingState>(machineRef.current.state);
  const [countdown, setCountdown] = useState(3);
  const [remaining, setRemaining] = useState(duration);
  const [stats, setStats] = useState(() => ({ ...statsRef.current }));
  const [feedbackSlots, setFeedbackSlots] = useState(emptyFeedbackSlots);
  const [milestone, setMilestone] = useState("");
  const [impactFlash, setImpactFlash] = useState<{ id: number; accent: "normal" | "fast" | "combo" }>({ id: 0, accent: "normal" });
  const [hitMarker, setHitMarker] = useState(false);
  const [fastMarker, setFastMarker] = useState(false);
  const [missMarker, setMissMarker] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SceneDiagnostics>();
  const [inputDiagnostics, setInputDiagnostics] = useState<PointerInputDebugSnapshot>();
  const [pointerInputMode, setPointerInputMode] = useState<PointerInputMode>("unlocked");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trainingSettingsOpen, setTrainingSettingsOpen] = useState(false);

  const fullscreenRootRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const sceneApi = useRef<GridShotSceneApi>(null);
  const remainingRef = useRef(duration);
  const lastFrame = useRef(performance.now());
  const feedbackCursor = useRef(0);
  const sessionResultRef = useRef<GridShotHistoryRecord | undefined>(undefined);
  const timers = useRef<number[]>([]);
  const fps = usePerformanceStore((state) => state.metrics.current);
  const frameTime = usePerformanceStore((state) => state.metrics.frameTime);
  const audio = useMemo(() => new AudioManager({
    master: () => settings.volume,
    hit: () => gridShotSettings.hitVolume,
    miss: () => gridShotSettings.missVolume,
    combo: () => gridShotSettings.comboVolume,
    muted: () => settings.muted,
  }), [gridShotSettings.comboVolume, gridShotSettings.hitVolume, gridShotSettings.missVolume, settings.muted, settings.volume]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
    return timer;
  }, []);

  const sync = useCallback(() => {
    setStats({
      ...statsRef.current,
      scoreTimeline: [...statsRef.current.scoreTimeline],
      hitIntervals: [...statsRef.current.hitIntervals],
      timeline: [...statsRef.current.timeline],
      events: statsRef.current.events.map((event) => ({ ...event })),
      phases: statsRef.current.phases.map((phase) => ({ ...phase })) as GridShotSessionStats["phases"],
      integrity: {
        ...statsRef.current.integrity,
        errors: [...statsRef.current.integrity.errors],
        checks: { ...statsRef.current.integrity.checks },
      },
      gradeDetails: { ...statsRef.current.gradeDetails },
    });
  }, []);

  useEffect(() => {
    if (machineRef.current.state !== "ready") return;
    remainingRef.current = duration;
    setRemaining(duration);
    statsRef.current = createEmptyGridShotStats(machineRef.current.sessionId, duration);
    sync();
  }, [duration, sync]);

  const commit = useCallback((transition: TransitionResult) => {
    machineRef.current = transition.machine;
    if (transition.changed) setTrainingState(transition.machine.state);
    return transition.changed;
  }, []);

  const pushHitFeedback = useCallback((score: number, label: string, interval: number | null, combo: number, stable: boolean) => {
    const id = feedbackCursor.current % 4;
    feedbackCursor.current += 1;
    setFeedbackSlots((slots) => slots.map((slot) => slot.id === id
      ? { id, active: true, score, label, interval, combo, stable }
      : slot));
    schedule(() => {
      setFeedbackSlots((slots) => slots.map((slot) => slot.id === id ? { ...slot, active: false } : slot));
    }, 460);
  }, [schedule]);

  const showMilestone = useCallback((combo: number) => {
    setMilestone(`COMBO ×${combo}|${combo >= 50 ? "HIGH FLOW" : "RHYTHM STABLE"}`);
    schedule(() => setMilestone(""), 760);
    audio.play("combo");
  }, [audio, schedule]);

  const processShot = useCallback((
    hit: boolean,
    reaction: number,
    forcedInterval?: number,
    metadata?: GridShotShotMetadata,
  ) => {
    if (machineRef.current.state !== "playing") return;
    const current = statsRef.current;
    const timestamp = metadata?.timestamp ?? performance.now();
    const elapsedMs = Math.max(0, (duration - remainingRef.current) * 1000);
    if (!hit) {
      applyGridShotMiss(current, { timestamp, elapsedMs });
      audio.play("miss");
      setMissMarker(true);
      schedule(() => setMissMarker(false), 120);
      sync();
      return { accent: "normal" as const };
    }

    const scored = applyGridShotHit(current, forcedInterval ?? null, reaction, duration, 0, {
      timestamp,
      elapsedMs,
      targetId: metadata?.targetId,
      targetActivatedAt: metadata?.targetActivatedAt,
      simulateInterval: forcedInterval !== undefined,
    });
    const interval = scored.interval;
    const fast = scored.speedBonus >= 40;
    const comboHit = COMBO_MILESTONES.includes(current.combo);
    audio.play(fast ? "fast" : "hit");
    pushHitFeedback(scored.total, fast ? "FAST" : "", interval, current.combo, scored.stabilityBonus > 0);
    setHitMarker(true);
    setFastMarker(fast);
    schedule(() => {
      setHitMarker(false);
      setFastMarker(false);
    }, 120);
    if (comboHit) showMilestone(current.combo);
    setImpactFlash((flash) => ({ id: flash.id + 1, accent: comboHit ? "combo" : fast ? "fast" : "normal" }));
    sync();
    return { accent: comboHit ? "combo" as const : fast ? "fast" as const : "normal" as const };
  }, [audio, duration, pushHitFeedback, schedule, showMilestone, sync]);

  const requestLock = useCallback(async () => {
    const root = fullscreenRootRef.current;
    if (!root) return;
    try {
      await root.requestFullscreen?.();
    } catch {
      // Fullscreen is optional when the browser denies the request.
    }
    const canvas = root.querySelector("canvas");
    if (!canvas) return;
    try {
      const mode = await requestRawPointerLock(canvas, () => document.pointerLockElement === canvas);
      setPointerInputMode(mode);
    } catch {
      setPointerInputMode("unlocked");
      // Pointer-lock changes drive the pause UI.
    }
    if (import.meta.env.DEV) {
      console.assert(document.fullscreenElement === root || document.fullscreenElement === null, "Fullscreen element must be grid-training-root");
      console.assert(Boolean(hudRef.current?.closest(".grid-training-root")), "HUD must be inside grid-training-root");
    }
  }, []);

  const startCountdownAction = useCallback(() => {
    setCountdown(3);
    commit(transitionToCountdown(machineRef.current));
  }, [commit]);

  const enterPlaying = useCallback(() => {
    lastFrame.current = performance.now();
    const current = machineRef.current;
    commit(current.state === "paused" ? resumeSession(current) : transitionToPlaying(current));
  }, [commit]);

  const pauseAction = useCallback((reason: PauseReason) => {
    commit(pauseSession(machineRef.current, reason));
  }, [commit]);

  const beginFinishAction = useCallback(() => {
    if (commit(beginFinish(machineRef.current))) {
      remainingRef.current = 0;
      setRemaining(0);
      sync();
    }
  }, [commit, sync]);

  const start = useCallback(async () => {
    audio.play("tick");
    if (visualMode) startCountdownAction();
    else await requestLock();
  }, [audio, requestLock, startCountdownAction, visualMode]);

  const restart = useCallback(() => {
    commit(resetSession(machineRef.current, crypto.randomUUID()));
    statsRef.current = createEmptyGridShotStats(machineRef.current.sessionId, duration);
    remainingRef.current = duration;
    sessionResultRef.current = undefined;
    feedbackCursor.current = 0;
    setStats({ ...statsRef.current });
    setRemaining(duration);
    setCountdown(3);
    setMilestone("");
    setImpactFlash({ id: 0, accent: "normal" });
    setFeedbackSlots(emptyFeedbackSlots());
  }, [commit, duration]);

  const qaHit = useCallback((interval: number) => {
    if (machineRef.current.state !== "playing") enterPlaying();
    const simulated = sceneApi.current?.simulateHit(interval);
    if (!simulated) processShot(true, interval, interval);
  }, [enterPlaying, processShot]);

  const qaCombo = useCallback((targetCombo: number) => {
    if (machineRef.current.state !== "playing") enterPlaying();
    while (statsRef.current.combo < targetCombo) processShot(true, 240, 240);
    setFeedbackSlots(emptyFeedbackSlots());
    showMilestone(targetCombo);
  }, [enterPlaying, processShot, showMilestone]);

  const inputLifecycle = useMemo<GridShotInputLifecycle>(() => ({
    onPointerLockChanged: (locked) => {
      if (visualMode) return;
      if (locked) {
        if (machineRef.current.state === "ready") startCountdownAction();
        else if (machineRef.current.state === "paused") enterPlaying();
      } else if (machineRef.current.state !== "finishing" && machineRef.current.state !== "finished") {
        setPointerInputMode("unlocked");
        pauseAction("pointer-lock");
      }
    },
    onFullscreenChanged: (fullscreen) => {
      if (!visualMode && !fullscreen && machineRef.current.state !== "finishing" && machineRef.current.state !== "finished") {
        pauseAction("fullscreen");
      }
    },
    onFocusChanged: (focused) => {
      if (!visualMode && !focused) pauseAction("blur");
    },
    onVisibilityChanged: (visible) => {
      if (!visualMode && !visible) pauseAction("hidden");
    },
  }), [enterPlaying, pauseAction, startCountdownAction, visualMode]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (trainingSettingsOpen) {
        if (event.key === "Escape") setTrainingSettingsOpen(false);
        return;
      }
      if (settingsOpen) {
        if (event.key === "Escape") setSettingsOpen(false);
        return;
      }
      if ((machineRef.current.state === "playing" || machineRef.current.state === "countdown") && event.key === "Tab") {
        event.preventDefault();
        return;
      }
      if (machineRef.current.state === "paused") {
        if (event.key === "Escape") void (visualMode ? Promise.resolve(enterPlaying()) : requestLock());
        if (event.key.toLowerCase() === "r") restart();
        if (event.key.toLowerCase() === "s") setSettingsOpen(true);
        if (event.key.toLowerCase() === "q") onHome();
        return;
      }
      if (event.key === "Escape" && machineRef.current.state === "playing") {
        event.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        pauseAction("escape");
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [enterPlaying, onHome, pauseAction, requestLock, restart, settingsOpen, trainingSettingsOpen, visualMode]);

  useEffect(() => {
    if (trainingState !== "countdown") return;
    audio.play("tick");
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          audio.play("start");
          schedule(enterPlaying, visualMode ? 180 : 220);
          return 0;
        }
        audio.play("tick");
        return value - 1;
      });
    }, visualMode ? 420 : 1000);
    return () => window.clearInterval(timer);
  }, [audio, enterPlaying, schedule, trainingState, visualMode]);

  useEffect(() => {
    if (trainingState !== "playing") return;
    let frame = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      const delta = Math.min(0.1, (now - lastFrame.current) / 1000);
      lastFrame.current = now;
      const previousRemaining = remainingRef.current;
      remainingRef.current = Math.max(0, previousRemaining - delta);
      const elapsed = duration - remainingRef.current;
      statsRef.current.elapsedTime = elapsed;

      const crossedWarnings = countdownWarningSeconds(previousRemaining, remainingRef.current);
      if (crossedWarnings.length > 0) {
        const warningSecond = crossedWarnings[crossedWarnings.length - 1];
        if (warningSecond <= 3) audio.playCountdown(warningSecond);
        else audio.play("tick");
      }

      if (now - lastHud > 80) {
        lastHud = now;
        refreshGridShotStats(statsRef.current, elapsed * 1000, 0);
        setRemaining(remainingRef.current);
        sync();
      }
      if (remainingRef.current <= 0) {
        beginFinishAction();
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [audio, beginFinishAction, duration, sync, trainingState]);

  useEffect(() => {
    if (trainingState !== "finishing") return;
    const root = fullscreenRootRef.current;
    root?.classList.add("is-finishing");
    audio.play("end");
    document.exitPointerLock?.();
    const timer = schedule(() => commit(completeFinish(machineRef.current)), visualMode ? 950 : 1250);
    return () => {
      window.clearTimeout(timer);
      root?.classList.remove("is-finishing");
    };
  }, [audio, commit, schedule, trainingState, visualMode]);

  useEffect(() => {
    if (trainingState !== "finished") return;
    const saveClaim = claimResultSave(machineRef.current);
    commit(saveClaim);
    if (saveClaim.changed) {
      sessionResultRef.current = createGridShotRecord(statsRef.current, duration);
    }
    const navigationClaim = claimResultNavigation(machineRef.current);
    commit(navigationClaim);
    if (navigationClaim.changed && sessionResultRef.current) {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
      onResult(sessionResultRef.current);
    }
  }, [commit, duration, onResult, trainingState, visualMode]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.assert(Boolean(hudRef.current?.closest(".grid-training-root")) || trainingState === "ready", "HUD must be inside fullscreen root");
    }
  }, [trainingState]);

  useEffect(() => {
    if (!visualMode) return;
    const updateDiagnostics = () => {
      const next = sceneApi.current?.getDiagnostics();
      if (next) setDiagnostics(next);
    };
    updateDiagnostics();
    const timer = window.setInterval(updateDiagnostics, 120);
    return () => window.clearInterval(timer);
  }, [visualMode]);

  useEffect(() => {
    if (!debugInput) return;
    const updateInputDiagnostics = () => {
      const next = sceneApi.current?.getInputDebugSnapshot();
      if (next) setInputDiagnostics(next);
    };
    updateInputDiagnostics();
    const timer = window.setInterval(updateInputDiagnostics, 100);
    return () => window.clearInterval(timer);
  }, [debugInput]);

  useEffect(() => () => {
    audio.dispose();
    timers.current.forEach(window.clearTimeout);
  }, [audio]);

  const finish = () => beginFinishAction();
  const accuracy = stats.accuracy.toFixed(1);
  const remainingLabel = `00:${String(Math.ceil(remaining)).padStart(2, "0")}`;

  return (
    <div
      className={`grid-training-root ${visualMode ? "qa-mode" : ""} effect-${gridShotSettings.hitEffectStyle} ${COMBO_MILESTONES.includes(stats.combo) ? "combo-pulse" : ""} state-${trainingState}`}
      ref={fullscreenRootRef}
      data-testid="grid-shot-fullscreen-root"
      data-hit-effect-style={gridShotSettings.hitEffectStyle}
    >
      <div className="grid-training-canvas">
        <Canvas
          dpr={Math.min((settings.dprMode === "auto" ? window.devicePixelRatio || 1 : settings.dprMode) * settings.renderScale, 2.5)}
          frameloop={typeof settings.fpsLimit === "number" ? "demand" : "always"}
          gl={{ antialias: settings.antialiasEnabled, powerPreference: "high-performance", alpha: false }}
        >
          <CanvasPerformanceMonitor />
          <RenderScheduler limit={settings.fpsLimit} />
          <GridShotArenaScene
            ref={sceneApi}
            state={trainingState}
            settings={settings}
            modeSettings={gridShotSettings}
            visualMode={visualMode}
            debugInput={debugInput}
            pointerInputMode={pointerInputMode}
            inputLifecycle={inputLifecycle}
            onShot={processShot}
          />
        </Canvas>
      </div>

      {trainingState !== "ready" && (
        <div
          className="grid-shot-hud-layer"
          ref={hudRef}
          style={{ "--hud-scale": settings.hudScale, "--hud-opacity": settings.hudOpacity } as React.CSSProperties}
        >
          <TrainingHud
            stats={stats}
            remaining={remaining}
            fps={fps}
            frameTime={frameTime}
            showFps={settings.showFps}
          />
        </div>
      )}

      {(trainingState === "playing" || trainingState === "paused") && (
        <div className={`crosshair-layer ${missMarker ? "is-miss" : ""}`}>
          <TrainingCrosshair settings={settings} hit={hitMarker} fast={fastMarker} />
        </div>
      )}

      <div className="hit-feedback-layer" aria-live="polite">
        {feedbackSlots.map((slot, index) => (
          <div
            key={slot.id}
            className={`hit-feedback-item slot-${index} ${slot.active ? "active" : ""}`}
          >
            <strong>+{slot.score}</strong>
            <span>
              {slot.label !== "FIRST" && slot.label}
              {slot.interval !== null ? `${slot.label !== "FIRST" ? " · " : ""}${Math.round(slot.interval)} ms` : ""}
            </span>
            {slot.combo >= 10 && <small>COMBO ×{slot.combo}</small>}
            {slot.stable && <em>STABLE +5</em>}
          </div>
        ))}
        {missMarker && <div className="miss-feedback">MISS</div>}
      </div>

      {impactFlash.id > 0 && gridShotSettings.screenGlow > 0 && (
        <div
          key={impactFlash.id}
          className={`grid-hit-vignette ${impactFlash.accent}`}
          style={{ "--grid-hit-glow-strength": gridShotSettings.screenGlow } as React.CSSProperties}
          aria-hidden="true"
        />
      )}

      {milestone && (
        <div className="combo-milestone">
          {milestone.split("|").map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
      {trainingState === "ready" && (
        <div className="training-overlay ready-panel">
          <span className="eyebrow">CLICKING / FOUNDATION 01</span>
          <h1>GRID <b>SHOT</b></h1>
          <p>看清目标，准星停稳，再打出下一枪。</p>
          <div className="ready-metrics">
            <span>训练时长<b>{duration} 秒</b></span>
            <span>同时目标<b>3 个</b></span>
            <span>训练场景<b>{activeScene.name}</b></span>
            <span>目标尺寸<b>{activeTargetSize.label}</b></span>
          </div>
          <div className="ready-actions">
            <button className="primary" onClick={start}><Play size={18} />开始训练</button>
            <button onClick={() => setTrainingSettingsOpen(true)}><SlidersHorizontal size={17} />训练设置</button>
            <button onClick={onHome}><Home size={17} />返回主页</button>
          </div>
        </div>
      )}

      {trainingState === "countdown" && (
        <div className="countdown-overlay">
          <span>GET READY</span>
          <strong key={countdown}>{countdown || "START"}</strong>
        </div>
      )}

      {trainingState === "paused" && (
        <div className="pause-backdrop">
          <div className="training-overlay pause-panel">
            <span className="eyebrow">SESSION PAUSED</span>
            <h2>训练已暂停</h2>
            <div className="pause-metrics">
              <span>当前得分<b>{stats.score.toLocaleString()}</b></span>
              <span>准确率<b>{accuracy}%</b></span>
              <span>Combo<b>×{stats.combo}</b></span>
              <span>剩余时间<b>{remainingLabel}</b></span>
            </div>
            <div className="pause-actions">
              <button className="primary" onClick={visualMode ? enterPlaying : requestLock}><Play size={18} />继续训练<kbd>ESC</kbd></button>
              <button onClick={restart}><RotateCcw size={17} />重新开始<kbd>R</kbd></button>
              <button onClick={() => setSettingsOpen(true)}><SettingsIcon size={17} />系统设置<kbd>S</kbd></button>
              <button onClick={onHome}><Home size={17} />退出训练<kbd>Q</kbd></button>
            </div>
          </div>
        </div>
      )}

      {trainingState === "finishing" && (
        <div className="finishing-summary">
          <span>SESSION COMPLETE</span>
          <strong>{stats.score.toLocaleString()}</strong>
          <small>TRAINING COMPLETE</small>
        </div>
      )}

      {settingsOpen && (
        <div className="in-training-settings-layer" role="dialog" aria-modal="true" aria-label="系统设置">
          <SettingsWorkspace
            settings={settings}
            onApply={onApplySettings}
            onClose={() => setSettingsOpen(false)}
            context="grid-shot"
          />
        </div>
      )}

      {trainingSettingsOpen && (
        <GridShotModeSettingsPanel
          settings={gridShotSettings}
          onApply={onApplyGridShotSettings}
          onClose={() => setTrainingSettingsOpen(false)}
        />
      )}

      {visualMode && (
        <QaPanel
          state={trainingState}
          remaining={remaining}
          stats={stats}
          diagnostics={diagnostics}
          actions={{
            countdown: startCountdownAction,
            play: enterPlaying,
            normal: () => qaHit(320),
            fast: () => qaHit(180),
            miss: () => processShot(false, 0),
            addCombo: () => qaHit(260),
            combo20: () => qaCombo(20),
            finalTen: () => {
              remainingRef.current = 9.8;
              setRemaining(9.8);
              enterPlaying();
            },
            finish,
            restart,
          }}
        />
      )}

      {debugInput && inputDiagnostics && <InputDebugPanel snapshot={inputDiagnostics} />}
    </div>
  );
}

function InputDebugPanel({ snapshot }: { snapshot: PointerInputDebugSnapshot }) {
  const time = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}ms`;
  return (
    <details className="input-debug-panel" open data-testid="grid-shot-input-debug">
      <summary>INPUT DIAGNOSTICS <b>{snapshot.activeMousemoveListeners === 1 ? "SINGLE" : "CONFLICT"}</b></summary>
      <div className="input-debug-summary">
        <code>listeners <b>{snapshot.activeMousemoveListeners}</b></code>
        <code>controller <b>{snapshot.controllerInstanceId.slice(-12)}</b></code>
        <code>yaw / pitch <b>{snapshot.yaw.toFixed(5)} / {snapshot.pitch.toFixed(5)}</b></code>
        <code>sensitivity <b>{snapshot.sensitivity.toFixed(3)}</b></code>
        <code>cm / 360 <b>{snapshot.cmPer360.toFixed(2)}</b></code>
        <code>rad / count <b>{snapshot.radiansPerMouseCount.toExponential(4)}</b></code>
        <code>input mode <b>{snapshot.inputMode}</b></code>
        <code>lock acquired <b>{time(snapshot.lastPointerLockAcquiredAt)}</b></code>
        <code>lock lost <b>{time(snapshot.lastPointerLockLostAt)}</b></code>
        <code>focus / blur <b>{time(snapshot.lastWindowFocusAt)} / {time(snapshot.lastWindowBlurAt)}</b></code>
        <code>duplicates <b>{snapshot.duplicateEventCount}</b></code>
        <code>stale replaced <b>{snapshot.staleControllerReplacementCount}</b></code>
        <code>last anomaly <b>{snapshot.lastIgnoredAbnormalInput?.ignoredReason ?? "—"}</b></code>
        <code>last active spike <b>{snapshot.lastSuspiciousAppliedInput?.suspiciousReason ?? "—"}</b></code>
        <code>last shot <b>{time(snapshot.lastShotAt)}</b></code>
      </div>
      <div className="input-debug-events">
        {snapshot.events.length === 0 && <p>Move the mouse after Pointer Lock to capture events.</p>}
        {[...snapshot.events].reverse().map((event, index) => (
          <code key={`${event.timestamp}-${index}`} className={`${event.applied ? "applied" : "ignored"} ${event.suspiciousReason ? "suspicious" : ""}`}>
            <span>{event.timestamp.toFixed(1)}</span>
            <b>
              {event.movementX}, {event.movementY}
              {((event.appliedMovementX ?? event.movementX) !== event.movementX || (event.appliedMovementY ?? event.movementY) !== event.movementY)
                ? ` → ${event.appliedMovementX ?? event.movementX}, ${event.appliedMovementY ?? event.movementY}`
                : ""}
            </b>
            <span>{event.yawBefore.toFixed(4)}→{event.yawAfter.toFixed(4)}</span>
            <span>{event.pitchBefore.toFixed(4)}→{event.pitchAfter.toFixed(4)}</span>
            <span>{event.trainingState}</span>
            <span>r/c {event.radiansPerMouseCount.toExponential(2)} · x {event.horizontalRatio.toFixed(2)} · y {event.verticalRatio.toFixed(2)}</span>
            <span>lock {Number(event.pointerLocked)} · full {Number(event.fullscreen)} · focus {Number(event.windowFocused)} · visible {Number(event.documentVisible)}</span>
            <span>listener {event.listenerInstanceId.slice(-8)}</span>
            <em>
              {event.suspiciousReason ?? (event.applied ? "APPLIED" : event.ignoredReason)}
              {event.millisecondsSinceShot !== undefined ? ` · shot ${event.millisecondsSinceShot.toFixed(1)}ms` : ""}
            </em>
          </code>
        ))}
      </div>
    </details>
  );
}

function QaPanel({
  state,
  remaining,
  stats,
  diagnostics,
  actions,
}: {
  state: TrainingState;
  remaining: number;
  stats: GridShotSessionStats;
  diagnostics?: SceneDiagnostics;
  actions: Record<string, () => void>;
}) {
  const counts = diagnostics?.counts;
  return (
    <aside className="grid-shot-qa-panel" data-testid="grid-shot-qa-panel">
      <header><b>VISUAL QA</b><span>FORMAL SCENE · DEV ONLY</span></header>
      <div className="qa-actions">
        <button onClick={actions.countdown}>倒计时</button>
        <button onClick={actions.play}>开始训练</button>
        <button onClick={actions.normal}>普通命中</button>
        <button onClick={actions.fast}>快速命中</button>
        <button onClick={actions.miss}>Miss</button>
        <button onClick={actions.addCombo}>增加 Combo</button>
        <button onClick={actions.combo20}>Combo 20</button>
        <button onClick={actions.finalTen}>最后 10 秒</button>
        <button onClick={actions.finish}>正常结束</button>
        <button onClick={actions.restart}>重新开始</button>
      </div>
      <div className="qa-metrics">
        <code>state <b>{state}</b></code>
        <code>remaining <b>{remaining.toFixed(1)}</b></code>
        <code>score <b>{stats.score}</b></code>
        <code>shots / hits <b>{stats.shots} / {stats.hits}</b></code>
        <code>combo / max <b>{stats.combo} / {stats.maxCombo}</b></code>
        <code>TPM <b>{stats.targetsPerMinute.toFixed(1)}</b></code>
        <code>pool / inactive <b>{counts?.poolSize ?? 0} / {counts?.inactive ?? 0}</b></code>
        <code>active colliders <b>{counts?.activeColliders ?? 0}</b></code>
        <code>visible / clickable <b>{counts?.visibleTargetBodies ?? 0} / {counts?.visuallyClickableTargets ?? 0}</b></code>
      </div>
    </aside>
  );
}
