import { afterEach, describe, expect, it } from "vitest";
import {
  PointerLockInputController,
  getActivePointerInputListenerCount,
  requestRawPointerLock,
  resetPointerInputRegistryForTests,
  type PointerInputConfiguration,
  type PointerInputEnvironment,
} from "./PointerLockInputController";

class FakeTarget {
  private listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListener) {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, event: object = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event as Event));
  }
  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function harness() {
  const windowTarget = new FakeTarget();
  const documentTarget = new FakeTarget();
  const state = {
    now: 0,
    locked: true,
    fullscreen: true,
    focused: true,
    visible: true,
    trainingState: "playing",
    active: true,
    radians: 0.001,
    horizontalRatio: 1,
    verticalRatio: 1,
    invertX: false,
    invertY: false,
    sensitivity: 0.55,
    cmPer360: 36,
    angles: [] as Array<{ yaw: number; pitch: number }>,
  };
  const environment: PointerInputEnvironment = {
    windowTarget,
    documentTarget,
    now: () => state.now,
    pointerLocked: () => state.locked,
    fullscreen: () => state.fullscreen,
    windowFocused: () => state.focused,
    documentVisible: () => state.visible,
  };
  const configuration = (): PointerInputConfiguration => ({
    getTrainingState: () => state.trainingState,
    shouldApplyInput: () => state.active,
    getRadiansPerMouseCount: () => state.radians,
    getHorizontalRatio: () => state.horizontalRatio,
    getVerticalRatio: () => state.verticalRatio,
    getInvertX: () => state.invertX,
    getInvertY: () => state.invertY,
    getSensitivity: () => state.sensitivity,
    getCmPer360: () => state.cmPer360,
    getInputMode: () => "raw-unadjusted",
    onAnglesChanged: (yaw, pitch) => state.angles.push({ yaw, pitch }),
    debugEnabled: true,
  });
  const controller = new PointerLockInputController(configuration(), environment);
  return { controller, configuration, documentTarget, environment, state, windowTarget };
}

afterEach(() => resetPointerInputRegistryForTests());

describe("PointerLockInputController", () => {
  it("requests unadjusted raw Pointer Lock first", async () => {
    const calls: Array<{ unadjustedMovement?: boolean } | undefined> = [];
    const mode = await requestRawPointerLock({
      requestPointerLock: (options) => { calls.push(options); },
    }, () => false);
    expect(mode).toBe("raw-unadjusted");
    expect(calls).toEqual([{ unadjustedMovement: true }]);
  });

  it("falls back to adjusted Pointer Lock when raw input is unavailable", async () => {
    const calls: Array<{ unadjustedMovement?: boolean } | undefined> = [];
    const mode = await requestRawPointerLock({
      requestPointerLock: (options) => {
        calls.push(options);
        if (options?.unadjustedMovement) return Promise.reject(new Error("unsupported"));
      },
    }, () => false);
    expect(mode).toBe("adjusted-fallback");
    expect(calls).toEqual([{ unadjustedMovement: true }, undefined]);
  });

  it("applies a single mousemove exactly once and detects duplicate delivery", () => {
    const { controller, state } = harness();
    controller.attach();
    state.now = 100;
    const event = { movementX: 20, movementY: -10 };
    controller.handleMouseMovement(event);
    controller.handleMouseMovement(event);
    expect(controller.getAngles()).toEqual({ yaw: -0.02, pitch: 0.01 });
    expect(state.angles).toHaveLength(1);
    expect(controller.getDebugSnapshot().duplicateEventCount).toBe(1);
  });

  it.each([60, 144, 165, 240])("produces identical rotation at %i FPS", (fps) => {
    const { controller, state } = harness();
    controller.attach();
    state.now = 1000 / fps;
    controller.handleMouseMovement({ movementX: 120, movementY: 45 });
    expect(controller.getAngles().yaw).toBeCloseTo(-0.12, 12);
    expect(controller.getAngles().pitch).toBeCloseTo(-0.045, 12);
  });

  it("does not accept or multiply by frame delta", () => {
    const { controller, state } = harness();
    controller.attach();
    state.now = 100;
    controller.handleMouseMovement({ movementX: 50, movementY: 0 });
    state.now = 10_000;
    controller.handleMouseMovement({ movementX: 50, movementY: 0 });
    expect(controller.getAngles().yaw).toBeCloseTo(-0.1, 12);
  });

  it("applies independent X and Y axis multipliers once", () => {
    const { controller, state } = harness();
    controller.attach();
    state.horizontalRatio = 1.5;
    state.verticalRatio = 0.75;
    state.now = 100;
    controller.handleMouseMovement({ movementX: 20, movementY: 20 });
    expect(controller.getAngles().yaw).toBeCloseTo(-0.03, 12);
    expect(controller.getAngles().pitch).toBeCloseTo(-0.015, 12);
  });

  it("supports independent X and Y inversion", () => {
    const { controller, state } = harness();
    controller.attach();
    state.invertX = true;
    state.invertY = false;
    state.now = 100;
    controller.handleMouseMovement({ movementX: 20, movementY: 20 });
    expect(controller.getAngles().yaw).toBeCloseTo(0.02, 12);
    expect(controller.getAngles().pitch).toBeCloseTo(-0.02, 12);
    controller.setAngles(0, 0);
    state.invertX = false;
    state.invertY = true;
    state.now = 200;
    controller.handleMouseMovement({ movementX: 20, movementY: 20 });
    expect(controller.getAngles().yaw).toBeCloseTo(-0.02, 12);
    expect(controller.getAngles().pitch).toBeCloseTo(0.02, 12);
  });

  it("survives Strict Mode attach-cleanup-attach with one listener", () => {
    const { controller, windowTarget } = harness();
    controller.attach();
    controller.detach();
    controller.attach();
    expect(windowTarget.count("mousemove")).toBe(1);
    expect(getActivePointerInputListenerCount()).toBe(1);
  });

  it("removes the listener on unmount", () => {
    const { controller, windowTarget } = harness();
    controller.attach();
    controller.detach();
    expect(windowTarget.count("mousemove")).toBe(0);
    expect(getActivePointerInputListenerCount()).toBe(0);
  });

  it("replaces a stale controller on another session without stacking", () => {
    const first = harness();
    const second = harness();
    first.controller.attach();
    second.controller.attach();
    expect(getActivePointerInputListenerCount()).toBe(1);
    expect(first.windowTarget.count("mousemove")).toBe(0);
    expect(second.windowTarget.count("mousemove")).toBe(1);
  });

  it("updates sensitivity without registering another listener", () => {
    const { configuration, controller, state, windowTarget } = harness();
    controller.attach();
    state.radians = 0.002;
    controller.updateConfiguration(configuration());
    state.now = 100;
    controller.handleMouseMovement({ movementX: 10, movementY: 0 });
    expect(controller.getAngles().yaw).toBeCloseTo(-0.02, 12);
    expect(windowTarget.count("mousemove")).toBe(1);
  });

  it("ignores input while paused and does not replay it after resume", () => {
    const { controller, state } = harness();
    controller.attach();
    state.trainingState = "paused";
    state.now = 100;
    controller.handleMouseMovement({ movementX: 400, movementY: 200 });
    state.trainingState = "playing";
    state.now = 200;
    controller.handleMouseMovement({ movementX: 10, movementY: 5 });
    expect(controller.getAngles()).toEqual({ yaw: -0.01, pitch: -0.005 });
  });

  it("ignores an abnormal first event inside the pointer-lock recovery window", () => {
    const { controller, documentTarget, state } = harness();
    controller.attach();
    state.now = 500;
    documentTarget.emit("pointerlockchange");
    state.now = 520;
    const result = controller.handleMouseMovement({ movementX: 900, movementY: 400 });
    expect(result?.applied).toBe(false);
    expect(result?.ignoredReason).toContain("transition-spike");
    expect(controller.getAngles()).toEqual({ yaw: 0, pitch: 0 });
  });

  it("preserves a large intentional flick outside transition guards", () => {
    const { controller, state } = harness();
    controller.attach();
    state.now = 100;
    controller.handleMouseMovement({ movementX: 5, movementY: 0 });
    state.now = 200;
    const result = controller.handleMouseMovement({ movementX: 1200, movementY: 0 });
    expect(result?.applied).toBe(true);
    expect(controller.getAngles().yaw).toBeCloseTo(-1.205, 12);
  });

  it("flags an active-play spike for diagnostics without suppressing it", () => {
    const { controller, state } = harness();
    controller.attach();
    for (let index = 0; index < 8; index += 1) {
      state.now = 100 + index * 10;
      controller.handleMouseMovement({ movementX: 10, movementY: 0 });
    }
    state.now = 300;
    const result = controller.handleMouseMovement({ movementX: 600, movementY: 0 });
    expect(result?.applied).toBe(true);
    expect(result?.suspiciousReason).toContain("active-spike");
    expect(controller.getDebugSnapshot().lastSuspiciousAppliedInput?.movementX).toBe(600);
  });

  it("clamps pitch without wrapping yaw", () => {
    const { controller, state } = harness();
    controller.attach();
    state.now = 100;
    controller.handleMouseMovement({ movementX: -5000, movementY: -5000 });
    expect(controller.getAngles().yaw).toBe(5);
    expect(controller.getAngles().pitch).toBe(1.15);
  });

  it("rejects non-finite input without poisoning camera angles", () => {
    const { controller, state } = harness();
    controller.attach();
    state.now = 100;
    controller.handleMouseMovement({ movementX: Number.NaN, movementY: Number.POSITIVE_INFINITY });
    expect(controller.getAngles()).toEqual({ yaw: 0, pitch: 0 });
    expect(Number.isFinite(controller.getAngles().yaw)).toBe(true);
    expect(Number.isFinite(controller.getAngles().pitch)).toBe(true);
  });

  it("clears hidden-page input and guards the first abnormal event after visibility returns", () => {
    const { controller, documentTarget, state } = harness();
    controller.attach();
    state.visible = false;
    state.trainingState = "paused";
    state.now = 300;
    documentTarget.emit("visibilitychange");
    controller.handleMouseMovement({ movementX: 700, movementY: 0 });
    state.visible = true;
    state.trainingState = "playing";
    state.now = 400;
    documentTarget.emit("visibilitychange");
    state.now = 420;
    const result = controller.handleMouseMovement({ movementX: 900, movementY: 0 });
    expect(result?.applied).toBe(false);
    expect(controller.getAngles()).toEqual({ yaw: 0, pitch: 0 });
  });
});
