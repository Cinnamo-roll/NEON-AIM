import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest } from "../../features/auth/authApi";
import type { GridShotEvent } from "../modes/gridShot/gridShotAnalytics";
import { DEFAULT_GRID_SHOT_SETTINGS } from "../modes/gridShot/gridShotConfig";
import { saveGridShotTrainingSession } from "../modes/gridShot/gridShotTrainingSessionService";
import { createEmptyGridShotStats, createGridShotRecord } from "../scoring/gridShotSession";
import {
  clearRetiredLocalTrainingData,
  saveTrainingSessionSubmission,
  type TrainingSessionSubmission,
} from "./trainingSessionService";

vi.mock("../../features/auth/authApi", () => ({ authenticatedRequest: vi.fn() }));

const requestMock = vi.mocked(authenticatedRequest);

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function record() {
  const stats = createEmptyGridShotStats("session-save-test", 60);
  const events: GridShotEvent[] = [
    {
      id: "event-1",
      sessionId: stats.sessionId,
      timestamp: 1_000,
      elapsedMs: 1_000,
      type: "hit",
      targetId: 1,
      targetActivatedAt: 750,
      targetLifetimeMs: 250,
      comboBefore: 0,
      comboAfter: 1,
      baseScore: 100,
      speedBonus: 0,
      comboBonus: 0,
      stabilityBonus: 0,
      totalScore: 100,
    },
    {
      id: "event-2",
      sessionId: stats.sessionId,
      timestamp: 2_000,
      elapsedMs: 2_000,
      type: "miss",
      comboBefore: 1,
      comboAfter: 0,
      baseScore: 0,
      speedBonus: 0,
      comboBonus: 0,
      stabilityBonus: 0,
      totalScore: 0,
    },
  ];
  stats.events = events;
  return createGridShotRecord(stats, 60);
}

function futureProjectSubmission(): TrainingSessionSubmission<
  { sensitivity: number },
  { samples: Array<{ x: number; y: number }> },
  { schemaVersion: number; evidence: string[] }
> {
  return {
    clientSessionId: "generic-session",
    trainingId: "future-project",
    modeVersion: 1,
    scoringVersion: 1,
    configurationKey: "future-project:practice",
    sessionType: "practice",
    startedAt: "2026-07-15T00:00:00.000Z",
    completedAt: "2026-07-15T00:00:30.000Z",
    durationMs: 30_000,
    configuration: { sensitivity: 1 },
    summary: { score: 1, hits: 0, misses: 0, accuracy: 0, targetsPerMinute: 0, averageHitInterval: 0, consistencyScore: 0, maxCombo: 0, grade: "-" },
    detail: { samples: [{ x: 1, y: 2 }] },
    analysisSnapshot: { schemaVersion: 1, evidence: ["future"] },
    integrity: { passed: true, errors: [] },
  };
}

describe("cloud-only training session persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    requestMock.mockReset();
  });

  it("does not persist or upload guest Grid Shot results", async () => {
    const result = await saveGridShotTrainingSession(record(), DEFAULT_GRID_SHOT_SETTINGS, "practice", false);

    expect(result.status).toBe("login-required");
    expect(requestMock).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("keeps the generic API independent from project detail types without queueing guest data", async () => {
    const result = await saveTrainingSessionSubmission(futureProjectSubmission(), false);

    expect(result.status).toBe("login-required");
    expect(requestMock).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("purges retired history and upload queues without touching unrelated settings", () => {
    localStorage.setItem("neon-grid-shot-history-v1", "legacy");
    localStorage.setItem("neon-grid-shot-history-v2", "current-local-history");
    localStorage.setItem("neon-training-upload-queue-v1", "legacy-queue");
    localStorage.setItem("neon-training-upload-queue-v2", "current-queue");
    localStorage.setItem("neon-settings", "keep-me");

    clearRetiredLocalTrainingData();

    expect(localStorage.getItem("neon-grid-shot-history-v1")).toBeNull();
    expect(localStorage.getItem("neon-grid-shot-history-v2")).toBeNull();
    expect(localStorage.getItem("neon-training-upload-queue-v1")).toBeNull();
    expect(localStorage.getItem("neon-training-upload-queue-v2")).toBeNull();
    expect(localStorage.getItem("neon-settings")).toBe("keep-me");
  });

  it("uploads authenticated sessions with project-owned detail and analysis data", async () => {
    requestMock.mockResolvedValue({ data: { summary: { id: "server-session" } }, message: null });
    const result = await saveGridShotTrainingSession(record(), DEFAULT_GRID_SHOT_SETTINGS, "benchmark", true);

    expect(result.status).toBe("saved-cloud");
    expect(result.serverSessionId).toBe("server-session");
    expect(localStorage.length).toBe(0);
    const [, init] = requestMock.mock.calls[0];
    const payload = JSON.parse(String(init?.body)) as {
      sessionType: string;
      detail: { segments: unknown[]; events: unknown[] };
      analysisSnapshot: { windows: unknown[] };
    };
    expect(payload.detail.segments).toHaveLength(12);
    expect(payload.detail.events).toHaveLength(2);
    expect(payload.analysisSnapshot.windows).toHaveLength(3);
    expect(payload.sessionType).toBe("benchmark");
  });

  it("reports a failed cloud save without creating a cross-account retry queue", async () => {
    requestMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await saveGridShotTrainingSession(record(), DEFAULT_GRID_SHOT_SETTINGS, "benchmark", true);

    expect(result.status).toBe("failed");
    expect(localStorage.length).toBe(0);
  });
});
