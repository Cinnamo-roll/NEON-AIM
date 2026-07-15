import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingSessionSaveResult, TrainingSessionSubmission } from "./trainingSessionService";
import {
  clearPendingGuestTrainingSessions,
  flushPendingGuestTrainingSessions,
  hasPendingGuestTrainingSession,
  listPendingGuestTrainingSessions,
  pendingGuestTrainingSessionCount,
  stagePendingGuestTrainingSession,
} from "./pendingGuestTrainingSessions";

function submission(clientSessionId: string): TrainingSessionSubmission {
  return {
    clientSessionId,
    trainingId: "fake-project",
    modeVersion: 1,
    scoringVersion: 1,
    configurationKey: "fake-project:practice",
    sessionType: "practice",
    startedAt: "2026-07-15T00:00:00.000Z",
    completedAt: "2026-07-15T00:00:30.000Z",
    durationMs: 30_000,
    configuration: {},
    summary: {
      score: 100,
      hits: 1,
      misses: 0,
      accuracy: 100,
      targetsPerMinute: 2,
      averageHitInterval: 500,
      consistencyScore: 100,
      maxCombo: 1,
      grade: "A",
    },
    detail: {},
    analysisSnapshot: {},
    integrity: { passed: true, errors: [] },
  };
}

describe("in-memory guest training queue", () => {
  beforeEach(() => clearPendingGuestTrainingSessions());

  it("keeps multiple guest sessions and uploads each after sign-in", async () => {
    stagePendingGuestTrainingSession(submission("session-1"));
    stagePendingGuestTrainingSession(submission("session-2"));
    const upload = vi.fn(async (item: TrainingSessionSubmission): Promise<TrainingSessionSaveResult> => ({
      status: "saved-cloud",
      sessionId: item.clientSessionId,
      serverSessionId: `server-${item.clientSessionId}`,
    }));

    const results = await flushPendingGuestTrainingSessions({ upload });

    expect(upload.mock.calls.map(([item]) => item.clientSessionId)).toEqual(["session-1", "session-2"]);
    expect(results).toHaveLength(2);
    expect(pendingGuestTrainingSessionCount()).toBe(0);
  });

  it("exposes a queue snapshot for the guest Career preview", () => {
    stagePendingGuestTrainingSession(submission("session-1"));

    const snapshot = listPendingGuestTrainingSessions();

    expect(snapshot.map((item) => item.clientSessionId)).toEqual(["session-1"]);
  });

  it("retains only failed sessions for a later connectivity retry", async () => {
    stagePendingGuestTrainingSession(submission("saved"));
    stagePendingGuestTrainingSession(submission("failed"));
    const upload = vi.fn(async (item: TrainingSessionSubmission): Promise<TrainingSessionSaveResult> => ({
      status: item.clientSessionId === "saved" ? "saved-cloud" : "failed",
      sessionId: item.clientSessionId,
    }));

    await flushPendingGuestTrainingSessions({ upload });

    expect(hasPendingGuestTrainingSession("saved")).toBe(false);
    expect(hasPendingGuestTrainingSession("failed")).toBe(true);
    expect(pendingGuestTrainingSessionCount()).toBe(1);
  });

  it("deduplicates the same client session and shares concurrent flushes", async () => {
    stagePendingGuestTrainingSession(submission("session-1"));
    stagePendingGuestTrainingSession(submission("session-1"));
    let resolveUpload!: (result: TrainingSessionSaveResult) => void;
    const upload = vi.fn(() => new Promise<TrainingSessionSaveResult>((resolve) => {
      resolveUpload = resolve;
    }));

    const first = flushPendingGuestTrainingSessions({ upload });
    const second = flushPendingGuestTrainingSessions({ upload });
    resolveUpload({ status: "saved-cloud", sessionId: "session-1", serverSessionId: "server-1" });

    expect(await second).toEqual(await first);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("uploads the currently visible review before older guest sessions", async () => {
    stagePendingGuestTrainingSession(submission("older-session"));
    stagePendingGuestTrainingSession(submission("visible-session"));
    const upload = vi.fn(async (item: TrainingSessionSubmission): Promise<TrainingSessionSaveResult> => ({
      status: "saved-cloud",
      sessionId: item.clientSessionId,
    }));

    await flushPendingGuestTrainingSessions({ upload, prioritizeSessionId: "visible-session" });

    expect(upload.mock.calls.map(([item]) => item.clientSessionId)).toEqual(["visible-session", "older-session"]);
  });
});
