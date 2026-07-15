export type TrainingState =
  "ready" | "countdown" | "playing" | "paused" | "finishing" | "finished";
export type TargetState =
  "inactive" | "spawning" | "active" | "hit" | "despawning";

export interface ScorePoint {
  time: number;
  score: number;
}
export interface GridShotSessionStats {
  sessionId: string;
  sessionDurationMs: number;
  events: GridShotEvent[];
  phases: [GridShotPhaseAnalytics, GridShotPhaseAnalytics, GridShotPhaseAnalytics];
  integrity: GridShotIntegrityResult;
  gradeDetails: GridShotGradeResult;
  score: number;
  shots: number;
  hits: number;
  misses: number;
  accuracy: number;
  combo: number;
  maxCombo: number;
  targetsPerMinute: number;
  elapsedTime: number;
  scoreTimeline: ScorePoint[];
  averageHitInterval:number;medianHitInterval:number;fastestHitInterval:number;slowestHitInterval:number;averageTargetLifetime:number;consistencyScore:number;
  baseScoreTotal:number;speedBonusTotal:number;comboBonusTotal:number;stabilityBonusTotal:number;
  currentPace:number;projectedFinalScore:number;personalBestDeltaPercent:number;hitIntervals:number[];
  timeline:Array<{time:number;score:number;accuracy:number;tpm:number;combo:number}>;
}
export interface GridShotHistoryRecord extends Omit<
  GridShotSessionStats,
  "combo" | "elapsedTime" | "events" | "phases" | "integrity" | "gradeDetails"
> {
  id: string;
  createdAt: string;
  duration: number;
  grade: string;
  sessionType?: import("../modes/gridShot/gridShotConfig").GridShotSessionType;
  configuration?: {
    targetSize: import("../modes/gridShot/gridShotConfig").GridShotTargetSize;
    activeTargetCount: number;
  };
  events?: GridShotEvent[];
  phases?: [GridShotPhaseAnalytics, GridShotPhaseAnalytics, GridShotPhaseAnalytics];
  integrity?: GridShotIntegrityResult;
  gradeDetails?: GridShotGradeResult;
}
export interface TrainingSettings {
  sensitivity: number;
  mouseDpi: number;
  horizontalRatio: number;
  verticalRatio: number;
  invertX: boolean;
  invertY: boolean;
  volume: number;
  muted: boolean;
  interfaceVolume: number;
  interfaceMuted: boolean;
  language: import("../../i18n").AppLanguage;
  crosshairColor: string;
  crosshairTop: boolean;
  crosshairBottom: boolean;
  crosshairLeft: boolean;
  crosshairRight: boolean;
  crosshairCenterDot: boolean;
  crosshairRing: boolean;
  crosshairThickness: number;
  crosshairLength: number;
  crosshairGap: number;
  crosshairDotSize: number;
  crosshairRingDiameter: number;
  crosshairOpacity: number;
  lowSpec: boolean;
  antialiasEnabled: boolean;
  fpsLimit: import("../performance/frameRate").FpsLimit;
  renderScale: number;
  dprMode: "auto" | 1 | 1.25 | 1.5 | 1.75 | 2;
  graphicsPreset: "low" | "medium" | "high" | "ultra" | "custom";
  hudScale: number;
  hudOpacity: number;
  showFps: boolean;
}
import type {
  GridShotEvent,
  GridShotIntegrityResult,
  GridShotPhaseAnalytics,
} from "../modes/gridShot/gridShotAnalytics";
import type { GridShotGradeResult } from "../modes/gridShot/gridShotGrade";
