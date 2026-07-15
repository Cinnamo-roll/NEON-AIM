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
  const targetSize = record.configuration?.targetSize ?? settings.targetSize;
  const activeTargetCount = record.configuration?.activeTargetCount ?? 3;
  const submissionRecord: GridShotHistoryRecord = {
    ...record,
    sessionType,
    configuration: {
      targetSize,
      activeTargetCount,
    },
  };
  const bundle = buildGridShotAnalysisBundle(submissionRecord, { targetSize });
  const completedAt = new Date(submissionRecord.createdAt);
  const durationMs = submissionRecord.duration * 1_000;
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
      duration: submissionRecord.duration,
      targetSize,
      activeTargetCount,
    },
    summary: bundle.aiSnapshot.summary,
    detail: {
      segments: bundle.detailSegments,
      events: submissionRecord.events ?? [],
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
  try {
    const submission = buildGridShotTrainingSessionSubmission(record, settings, sessionType);
    return await saveTrainingSessionSubmission(submission, authenticated);
  } catch {
    return { status: "failed", sessionId: record.sessionId };
  }
}
