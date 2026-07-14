import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedRequest } from "../../features/auth/authApi";
import type { GridShotEvent } from "../modes/gridShot/gridShotAnalytics";
import { DEFAULT_GRID_SHOT_SETTINGS } from "../modes/gridShot/gridShotConfig";
import { createEmptyGridShotStats, createGridShotRecord } from "../scoring/gridShotSession";
import { readHistory } from "./trainingStorage";
import {
  pendingTrainingSessionCount,
  saveGridShotTrainingSession,
  syncPendingTrainingSessions,
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
      speedBonus: 30,
      comboBonus: 0,
      stabilityBonus: 0,
      totalScore: 130,
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

describe("training session local-first persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    requestMock.mockReset();
  });

  it("keeps guest results locally and queues the cloud payload", async () => {
    const result = await saveGridShotTrainingSession(record(), DEFAULT_GRID_SHOT_SETTINGS, "practice", false);

    expect(result.status).toBe("saved-local");
    expect(readHistory()).toHaveLength(1);
    expect(readHistory()[0].configuration).toEqual({ targetSize: "medium", activeTargetCount: 3 });
    expect(pendingTrainingSessionCount()).toBe(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("drops the pre-career history and upload queue during the one-time storage reset", () => {
    localStorage.setItem("neon-grid-shot-history-v1", JSON.stringify([record()]));
    localStorage.setItem("neon-training-upload-queue-v1", JSON.stringify([{ clientSessionId: "legacy" }]));

    expect(readHistory()).toEqual([]);
    expect(pendingTrainingSessionCount()).toBe(0);
    expect(localStorage.getItem("neon-grid-shot-history-v1")).toBeNull();
    expect(localStorage.getItem("neon-training-upload-queue-v1")).toBeNull();
  });

  it("uploads authenticated sessions with detailed segments and a compact AI snapshot", async () => {
    requestMock.mockResolvedValue({ data: { summary: { id: "server-session" } }, message: null });
    const result = await saveGridShotTrainingSession(record(), DEFAULT_GRID_SHOT_SETTINGS, "benchmark", true);

    expect(result.status).toBe("saved-cloud");
    expect(result.serverSessionId).toBe("server-session");
    expect(pendingTrainingSessionCount()).toBe(0);
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

  it("retains failed uploads and synchronizes them after the connection recovers", async () => {
    requestMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const saved = await saveGridShotTrainingSession(record(), DEFAULT_GRID_SHOT_SETTINGS, "benchmark", true);
    expect(saved.status).toBe("pending-sync");
    expect(pendingTrainingSessionCount()).toBe(1);

    requestMock.mockResolvedValue({ data: { summary: { id: "server-session" } }, message: null });
    const sync = await syncPendingTrainingSessions();
    expect(sync.syncedSessionIds).toEqual(["session-save-test"]);
    expect(sync.serverSessionIds).toEqual({ "session-save-test": "server-session" });
    expect(sync.remaining).toBe(0);
  });

  it("deduplicates local history and pending uploads by client session ID", async () => {
    const sameRecord = record();
    await saveGridShotTrainingSession(sameRecord, DEFAULT_GRID_SHOT_SETTINGS, "practice", false);
    await saveGridShotTrainingSession(sameRecord, DEFAULT_GRID_SHOT_SETTINGS, "practice", false);

    expect(readHistory()).toHaveLength(1);
    expect(pendingTrainingSessionCount()).toBe(1);
  });
});
