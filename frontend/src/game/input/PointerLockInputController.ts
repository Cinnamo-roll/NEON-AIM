export interface MouseInputDebugEvent {
  timestamp: number;
  movementX: number;
  movementY: number;
  yawBefore: number;
  pitchBefore: number;
  yawAfter: number;
  pitchAfter: number;
  radiansPerMouseCount: number;
  horizontalRatio: number;
  verticalRatio: number;
  pointerLocked: boolean;
  fullscreen: boolean;
  windowFocused: boolean;
  documentVisible: boolean;
  trainingState: string;
  listenerInstanceId: string;
  applied: boolean;
  ignoredReason?: string;
  suspiciousReason?: string;
  millisecondsSinceShot?: number;
  appliedMovementX?: number;
  appliedMovementY?: number;
}

export interface PointerLockGuard {
  lockedAt: number;
  ignoreNextEvents: number;
  guardDurationMs: number;
}

export type PointerInputMode = "unlocked" | "raw-unadjusted" | "adjusted-fallback";

export interface PointerLockRequestTarget {
  requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
}

export async function requestRawPointerLock(
  target: PointerLockRequestTarget,
  isAlreadyLocked: () => boolean,
): Promise<Exclude<PointerInputMode, "unlocked">> {
  try {
    await target.requestPointerLock({ unadjustedMovement: true });
    return "raw-unadjusted";
  } catch {
    if (!isAlreadyLocked()) await target.requestPointerLock();
    return "adjusted-fallback";
  }
}

export interface PointerInputDebugSnapshot {
  events: MouseInputDebugEvent[];
  activeMousemoveListeners: number;
  controllerInstanceId: string;
  lastPointerLockAcquiredAt: number | null;
  lastPointerLockLostAt: number | null;
  lastWindowFocusAt: number | null;
  lastWindowBlurAt: number | null;
  lastIgnoredAbnormalInput: MouseInputDebugEvent | null;
  lastSuspiciousAppliedInput: MouseInputDebugEvent | null;
  lastShotAt: number | null;
  yaw: number;
  pitch: number;
  sensitivity: number;
  cmPer360: number;
  radiansPerMouseCount: number;
  horizontalRatio: number;
  duplicateEventCount: number;
  staleControllerReplacementCount: number;
  inputMode: PointerInputMode;
}

interface MouseMovementLike {
  movementX: number;
  movementY: number;
}

interface ListenerTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface PointerInputEnvironment {
  windowTarget: ListenerTarget;
  documentTarget: ListenerTarget;
  now: () => number;
  pointerLocked: () => boolean;
  fullscreen: () => boolean;
  windowFocused: () => boolean;
  documentVisible: () => boolean;
}

export interface PointerInputConfiguration {
  getTrainingState: () => string;
  shouldApplyInput: () => boolean;
  getRadiansPerMouseCount: () => number;
  getHorizontalRatio: () => number;
  getVerticalRatio: () => number;
  getInvertX: () => boolean;
  getInvertY: () => boolean;
  getSensitivity: () => number;
  getCmPer360: () => number;
  getInputMode: () => PointerInputMode;
  onAnglesChanged: (yaw: number, pitch: number) => void;
  onPointerLockChanged?: (locked: boolean) => void;
  onFullscreenChanged?: (fullscreen: boolean) => void;
  onFocusChanged?: (focused: boolean) => void;
  onVisibilityChanged?: (visible: boolean) => void;
  debugEnabled: boolean;
  pitchMin?: number;
  pitchMax?: number;
  guardDurationMs?: number;
}

let activeController: PointerLockInputController | null = null;
let activeMousemoveListeners = 0;
let staleControllerReplacementCount = 0;
const processedMouseEvents = new WeakMap<object, string>();

function createInstanceId() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `pointer-input-${suffix}`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class PointerLockInputController {
  readonly instanceId = createInstanceId();
  private readonly environment: PointerInputEnvironment;
  private configuration: PointerInputConfiguration;
  private attached = false;
  private yaw = 0;
  private pitch = 0;
  private readonly debugEvents: MouseInputDebugEvent[] = [];
  private readonly recentMagnitudes: number[] = [];
  private readonly locallyProcessedEvents = new WeakSet<object>();
  private duplicateEventCount = 0;
  private lastPointerLockAcquiredAt: number | null = null;
  private lastPointerLockLostAt: number | null = null;
  private lastWindowFocusAt: number | null = null;
  private lastWindowBlurAt: number | null = null;
  private lastIgnoredAbnormalInput: MouseInputDebugEvent | null = null;
  private lastSuspiciousAppliedInput: MouseInputDebugEvent | null = null;
  private lastShotAt: number | null = null;
  private guard: PointerLockGuard;

  constructor(configuration: PointerInputConfiguration, environment?: PointerInputEnvironment) {
    this.configuration = configuration;
    this.environment = environment ?? {
      windowTarget: window,
      documentTarget: document,
      now: () => performance.now(),
      pointerLocked: () => Boolean(document.pointerLockElement),
      fullscreen: () => Boolean(document.fullscreenElement),
      windowFocused: () => document.hasFocus(),
      documentVisible: () => document.visibilityState === "visible",
    };
    this.guard = {
      lockedAt: Number.NEGATIVE_INFINITY,
      ignoreNextEvents: 0,
      guardDurationMs: configuration.guardDurationMs ?? 70,
    };
  }

  updateConfiguration(configuration: PointerInputConfiguration) {
    this.configuration = configuration;
    this.guard.guardDurationMs = configuration.guardDurationMs ?? 70;
  }

  attach() {
    if (this.attached) return;
    if (activeController && activeController !== this) {
      staleControllerReplacementCount += 1;
      activeController.detach();
    }
    // oxlint-disable-next-line typescript/no-this-alias -- the module registry guarantees one formal controller/listener.
    activeController = this;
    this.environment.windowTarget.addEventListener("mousemove", this.onMouseMove);
    this.environment.documentTarget.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.environment.documentTarget.addEventListener("fullscreenchange", this.onFullscreenChange);
    this.environment.documentTarget.addEventListener("visibilitychange", this.onVisibilityChange);
    this.environment.windowTarget.addEventListener("focus", this.onFocus);
    this.environment.windowTarget.addEventListener("blur", this.onBlur);
    activeMousemoveListeners += 1;
    this.attached = true;
    if (this.environment.pointerLocked()) this.markPointerLockAcquired();
  }

  detach() {
    if (!this.attached) return;
    this.environment.windowTarget.removeEventListener("mousemove", this.onMouseMove);
    this.environment.documentTarget.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.environment.documentTarget.removeEventListener("fullscreenchange", this.onFullscreenChange);
    this.environment.documentTarget.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.environment.windowTarget.removeEventListener("focus", this.onFocus);
    this.environment.windowTarget.removeEventListener("blur", this.onBlur);
    activeMousemoveListeners = Math.max(0, activeMousemoveListeners - 1);
    this.attached = false;
    this.clearTransientInput();
    if (activeController === this) activeController = null;
  }

  setAngles(yaw: number, pitch: number) {
    this.yaw = Number.isFinite(yaw) ? yaw : 0;
    this.pitch = Number.isFinite(pitch) ? this.clampPitch(pitch) : 0;
    this.configuration.onAnglesChanged(this.yaw, this.pitch);
  }

  clearTransientInput() {
    this.guard.ignoreNextEvents = 0;
  }

  armTransitionGuard() {
    this.guard.lockedAt = this.environment.now();
    this.guard.ignoreNextEvents = 1;
  }

  getAngles() {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  markShot(timestamp = this.environment.now()) {
    this.lastShotAt = timestamp;
  }

  getDebugSnapshot(): PointerInputDebugSnapshot {
    return {
      events: this.debugEvents.map((event) => ({ ...event })),
      activeMousemoveListeners,
      controllerInstanceId: this.instanceId,
      lastPointerLockAcquiredAt: this.lastPointerLockAcquiredAt,
      lastPointerLockLostAt: this.lastPointerLockLostAt,
      lastWindowFocusAt: this.lastWindowFocusAt,
      lastWindowBlurAt: this.lastWindowBlurAt,
      lastIgnoredAbnormalInput: this.lastIgnoredAbnormalInput ? { ...this.lastIgnoredAbnormalInput } : null,
      lastSuspiciousAppliedInput: this.lastSuspiciousAppliedInput ? { ...this.lastSuspiciousAppliedInput } : null,
      lastShotAt: this.lastShotAt,
      yaw: this.yaw,
      pitch: this.pitch,
      sensitivity: this.configuration.getSensitivity(),
      cmPer360: this.configuration.getCmPer360(),
      radiansPerMouseCount: this.configuration.getRadiansPerMouseCount(),
      horizontalRatio: this.configuration.getHorizontalRatio(),
      duplicateEventCount: this.duplicateEventCount,
      staleControllerReplacementCount,
      inputMode: this.configuration.getInputMode(),
    };
  }

  /** Test seam: the browser listener calls this exact path. No frame delta is accepted or applied. */
  handleMouseMovement(event: MouseMovementLike & object): MouseInputDebugEvent | undefined {
    const timestamp = this.environment.now();
    const movementX = Number(event.movementX);
    const movementY = Number(event.movementY);
    const yawBefore = this.yaw;
    const pitchBefore = this.pitch;
    const radiansPerMouseCount = this.configuration.getRadiansPerMouseCount();
    const horizontalRatio = this.configuration.getHorizontalRatio();
    const verticalRatio = this.configuration.getVerticalRatio();
    const trainingState = this.configuration.getTrainingState();
    const debugEnabled = this.configuration.debugEnabled;
    let suspiciousReason: string | undefined;
    let appliedMovementX = movementX;
    let appliedMovementY = movementY;
    const millisecondsSinceShot = this.lastShotAt === null ? undefined : timestamp - this.lastShotAt;
    const debugEvent = (applied: boolean, ignoredReason?: string): MouseInputDebugEvent | undefined => {
      if (!debugEnabled) return undefined;
      return {
        timestamp,
        movementX,
        movementY,
        yawBefore,
        pitchBefore,
        yawAfter: this.yaw,
        pitchAfter: this.pitch,
        radiansPerMouseCount,
        horizontalRatio,
        verticalRatio,
        pointerLocked: this.environment.pointerLocked(),
        fullscreen: this.environment.fullscreen(),
        windowFocused: this.environment.windowFocused(),
        documentVisible: this.environment.documentVisible(),
        trainingState,
        listenerInstanceId: this.instanceId,
        applied,
        ignoredReason,
        suspiciousReason,
        millisecondsSinceShot,
        appliedMovementX,
        appliedMovementY,
      };
    };
    const ignored = (reason: string, abnormal = false) => {
      const result = debugEvent(false, reason);
      if (result) {
        if (abnormal) this.lastIgnoredAbnormalInput = result;
        this.record(result);
      }
      return result;
    };

    if (debugEnabled && this.locallyProcessedEvents.has(event)) {
      this.duplicateEventCount += 1;
      return ignored("duplicate-event-same-controller");
    }
    if (debugEnabled) {
      this.locallyProcessedEvents.add(event);
      const priorOwner = processedMouseEvents.get(event);
      if (priorOwner && priorOwner !== this.instanceId) {
        this.duplicateEventCount += 1;
        return ignored(`duplicate-event-other-controller:${priorOwner}`);
      }
      processedMouseEvents.set(event, this.instanceId);
    }

    if (!this.attached) return ignored("controller-detached");
    if (!Number.isFinite(movementX) || !Number.isFinite(movementY) || !Number.isFinite(radiansPerMouseCount) || !Number.isFinite(horizontalRatio) || !Number.isFinite(verticalRatio)) {
      return ignored("non-finite-input");
    }
    if (trainingState !== "playing") return ignored(`training-state:${trainingState}`);
    if (!this.configuration.shouldApplyInput()) return ignored("input-not-active");

    const magnitude = Math.hypot(movementX, movementY);
    const inGuardWindow = this.guard.ignoreNextEvents > 0 && timestamp - this.guard.lockedAt <= this.guard.guardDurationMs;
    if (inGuardWindow) {
      const typicalMagnitude = median(this.recentMagnitudes);
      const abnormalThreshold = this.recentMagnitudes.length < 5 ? 800 : Math.max(250, typicalMagnitude * 8 + 80);
      this.guard.ignoreNextEvents -= 1;
      if (magnitude >= abnormalThreshold) {
        return ignored(`transition-spike:${Math.round(magnitude)}>=${Math.round(abnormalThreshold)}`, true);
      }
    } else if (timestamp - this.guard.lockedAt > this.guard.guardDurationMs) {
      this.guard.ignoreNextEvents = 0;
    }

    // Active-play spikes are logged but never modified. Raw Pointer Lock input
    // is applied one-to-one so sensitivity remains deterministic.
    if (debugEnabled && this.recentMagnitudes.length >= 8) {
      const typicalMagnitude = median(this.recentMagnitudes);
      const suspiciousThreshold = Math.max(300, typicalMagnitude * 10 + 100);
      if (magnitude >= suspiciousThreshold) {
        suspiciousReason = `active-spike:${Math.round(magnitude)}>=${Math.round(suspiciousThreshold)}`;
      }
    }

    const invertXMultiplier = this.configuration.getInvertX() ? -1 : 1;
    const invertYMultiplier = this.configuration.getInvertY() ? -1 : 1;
    const nextYaw = yawBefore - appliedMovementX * radiansPerMouseCount * horizontalRatio * invertXMultiplier;
    const nextPitch = this.clampPitch(pitchBefore - appliedMovementY * radiansPerMouseCount * verticalRatio * invertYMultiplier);
    if (!Number.isFinite(nextYaw) || !Number.isFinite(nextPitch)) return ignored("non-finite-angle");

    this.yaw = nextYaw;
    this.pitch = nextPitch;
    this.recentMagnitudes.push(Math.hypot(appliedMovementX, appliedMovementY));
    if (this.recentMagnitudes.length > 32) this.recentMagnitudes.shift();
    this.configuration.onAnglesChanged(this.yaw, this.pitch);
    const result = debugEvent(true);
    if (result) {
      if (suspiciousReason) this.lastSuspiciousAppliedInput = result;
      this.record(result);
    }
    return result;
  }

  private readonly onMouseMove: EventListener = (event) => {
    this.handleMouseMovement(event as MouseEvent & object);
  };

  private readonly onPointerLockChange: EventListener = () => {
    const locked = this.environment.pointerLocked();
    if (locked) this.markPointerLockAcquired();
    else {
      this.lastPointerLockLostAt = this.environment.now();
      this.clearTransientInput();
    }
    this.configuration.onPointerLockChanged?.(locked);
  };

  private readonly onFullscreenChange: EventListener = () => {
    const fullscreen = this.environment.fullscreen();
    if (fullscreen) this.armTransitionGuard();
    else this.clearTransientInput();
    this.configuration.onFullscreenChanged?.(fullscreen);
  };

  private readonly onVisibilityChange: EventListener = () => {
    const visible = this.environment.documentVisible();
    if (visible) this.armTransitionGuard();
    else this.clearTransientInput();
    this.configuration.onVisibilityChanged?.(visible);
  };

  private readonly onFocus: EventListener = () => {
    this.lastWindowFocusAt = this.environment.now();
    this.armTransitionGuard();
    this.configuration.onFocusChanged?.(true);
  };

  private readonly onBlur: EventListener = () => {
    this.lastWindowBlurAt = this.environment.now();
    this.clearTransientInput();
    this.configuration.onFocusChanged?.(false);
  };

  private markPointerLockAcquired() {
    this.lastPointerLockAcquiredAt = this.environment.now();
    this.armTransitionGuard();
  }

  private clampPitch(value: number) {
    return Math.max(this.configuration.pitchMin ?? -1.15, Math.min(this.configuration.pitchMax ?? 1.15, value));
  }

  private record(event: MouseInputDebugEvent) {
    this.debugEvents.push(event);
    if (this.debugEvents.length > 100) this.debugEvents.shift();
    return event;
  }
}

export function getActivePointerInputListenerCount() {
  return activeMousemoveListeners;
}

export function resetPointerInputRegistryForTests() {
  activeController?.detach();
  activeController = null;
  activeMousemoveListeners = 0;
  staleControllerReplacementCount = 0;
}
