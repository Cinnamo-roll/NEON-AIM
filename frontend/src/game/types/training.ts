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
  averageReactionTime: number;
  fastestReactionTime: number;
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
  events?: GridShotEvent[];
  phases?: [GridShotPhaseAnalytics, GridShotPhaseAnalytics, GridShotPhaseAnalytics];
  integrity?: GridShotIntegrityResult;
  gradeDetails?: GridShotGradeResult;
}
export interface TrainingSettings {
  sensitivity: number;
  mouseDpi: number;
  pollingRate: number;
  horizontalRatio: number;
  verticalRatio: number;
  fov: number;
  invertX: boolean;
  invertY: boolean;
  volume: number;
  muted: boolean;
  crosshair: string;
  crosshairColor: string;
  crosshairThickness: number;
  crosshairLength: number;
  crosshairGap: number;
  crosshairOpacity: number;
  showHitMarker: boolean;
  lowSpec: boolean;
  antialiasEnabled: boolean;
  fpsLimit: import("../performance/frameRate").FpsLimit;
  renderScale: number;
  dprMode: "auto" | 1 | 1.25 | 1.5 | 1.75 | 2;
  uiScale: number;
  graphicsPreset: "low" | "medium" | "high" | "ultra" | "custom";
  particleQuality: "off" | "low" | "high";
  fogEnabled: boolean;
  dynamicGridEnabled: boolean;
  hudScale: number;
  hudOpacity: number;
  showFps: boolean;
  targetColor: string;
  targetSize: number;
  hitVolume: number;
  missVolume: number;
  comboVolume: number;
}
import type {
  GridShotEvent,
  GridShotIntegrityResult,
  GridShotPhaseAnalytics,
} from "../modes/gridShot/gridShotAnalytics";
import type { GridShotGradeResult } from "../modes/gridShot/gridShotGrade";
