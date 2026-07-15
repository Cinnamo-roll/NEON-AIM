import {
  saveTrainingSessionSubmission,
  type TrainingSessionSaveResult,
  type TrainingSessionSubmission,
} from "./trainingSessionService";

type SessionUploader = (submission: TrainingSessionSubmission) => Promise<TrainingSessionSaveResult>;
type FlushOptions = {
  upload?: SessionUploader;
  prioritizeSessionId?: string;
};

const pendingSessions = new Map<string, TrainingSessionSubmission>();
let activeFlush: Promise<TrainingSessionSaveResult[]> | null = null;

/**
 * Keeps an unsaved guest result only for the lifetime of the current page.
 * This module intentionally never reads from or writes to browser storage.
 */
export function stagePendingGuestTrainingSession(submission: TrainingSessionSubmission) {
  pendingSessions.set(submission.clientSessionId, submission);
}

export function hasPendingGuestTrainingSession(sessionId: string) {
  return pendingSessions.has(sessionId);
}

export function pendingGuestTrainingSessionCount() {
  return pendingSessions.size;
}

/** Returns a read-only snapshot for guest-facing previews without exposing the mutable queue. */
export function listPendingGuestTrainingSessions(): readonly TrainingSessionSubmission[] {
  return [...pendingSessions.values()];
}

export function clearPendingGuestTrainingSessions() {
  pendingSessions.clear();
}

/**
 * Uploads the current snapshot in completion order. Successful items are removed;
 * failed items remain in memory so an online/focus retry can try them again.
 */
export function flushPendingGuestTrainingSessions(
  options: FlushOptions = {},
) {
  if (activeFlush) return activeFlush;

  const snapshot = [...pendingSessions.values()];
  const priorityIndex = options.prioritizeSessionId
    ? snapshot.findIndex((submission) => submission.clientSessionId === options.prioritizeSessionId)
    : -1;
  if (priorityIndex > 0) snapshot.unshift(...snapshot.splice(priorityIndex, 1));
  const upload = options.upload ?? ((submission) => saveTrainingSessionSubmission(submission, true));
  activeFlush = (async () => {
    const results: TrainingSessionSaveResult[] = [];
    for (const submission of snapshot) {
      if (pendingSessions.get(submission.clientSessionId) !== submission) continue;
      let result: TrainingSessionSaveResult;
      try {
        result = await upload(submission);
      } catch {
        result = { status: "failed", sessionId: submission.clientSessionId };
      }
      results.push(result);
      if (result.status === "saved-cloud"
          && pendingSessions.get(submission.clientSessionId) === submission) {
        pendingSessions.delete(submission.clientSessionId);
      }
    }
    return results;
  })().finally(() => {
    activeFlush = null;
  });
  return activeFlush;
}
