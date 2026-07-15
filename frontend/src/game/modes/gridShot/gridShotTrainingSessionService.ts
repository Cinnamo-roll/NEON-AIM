import type { TrainingSessionAnalysisSnapshot } from "../../analysis/trainingAnalysis";
import type { GridShotHistoryRecord } from "../../types/training";
import {
  saveTrainingSessionSubmission,
  type TrainingSessionSaveResult,
  type TrainingSessionSubmission,
} from "../../storage/trainingSessionService";
import { buildGridShotAnalysisBundle, type GridShotDetailSegment } from "./gridShotAnalysisSnapshot";
import type { GridShotEvent } from "./gridShotAnalytics";
import type { GridShotModeSettings, GridShotSessionType } from "./gridShotConfig";

interface GridShotSubmissionConfiguration extends Record<string, unknown> {
  duration: number;
  targetSize: string;
  activeTargetCount: number;
}

interface GridShotSubmissionDetail extends Record<string, unknown> {
  segments: GridShotDetailSegment[];
  events: GridShotEvent[];
}

export function buildGridShotTrainingSessionSubmission(
  record: GridShotHistoryRecord,
  settings: GridShotModeSettings,
  sessionType: GridShotSessionType,
): TrainingSessionSubmission<
  GridShotSubmissionConfiguration,
  GridShotSubmissionDetail,
  TrainingSessionAnalysisSnapshot & Record<string, unknown>
> {
  const bundle = buildGridShotAnalysisBundle(record, { targetSize: settings.targetSize });
  const completedAt = new Date(record.createdAt);
  const durationMs = record.duration * 1_000;
  return {
    clientSessionId: record.sessionId,
    trainingId: bundle.aiSnapshot.training.id,
    modeVersion: bundle.aiSnapshot.training.modeVersion,
    scoringVersion: bundle.aiSnapshot.training.scoringVersion,
    configurationKey: bundle.aiSnapshot.training.configurationKey,
    sessionType,
    startedAt: new Date(completedAt.getTime() - durationMs).toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    configuration: {
      duration: record.duration,
      targetSize: settings.targetSize,
      activeTargetCount: 3,
    },
    summary: bundle.aiSnapshot.summary,
    detail: {
      segments: bundle.detailSegments,
      events: record.events ?? [],
    },
    analysisSnapshot: bundle.aiSnapshot as TrainingSessionAnalysisSnapshot & Record<string, unknown>,
    integrity: bundle.aiSnapshot.integrity,
  };
}

export async function saveGridShotTrainingSession(
  record: GridShotHistoryRecord,
  settings: GridShotModeSettings,
  sessionType: GridShotSessionType,
  authenticated: boolean,
): Promise<TrainingSessionSaveResult> {
  const submissionRecord: GridShotHistoryRecord = {
    ...record,
    sessionType,
    configuration: {
      targetSize: settings.targetSize,
      activeTargetCount: 3,
    },
  };
  try {
    const submission = buildGridShotTrainingSessionSubmission(submissionRecord, settings, sessionType);
    return await saveTrainingSessionSubmission(submission, authenticated);
  } catch {
    return { status: "failed", sessionId: record.sessionId };
  }
}
