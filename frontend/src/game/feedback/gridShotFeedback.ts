import type { HitScoreBreakdown } from "../scoring/gridShotScoring";
export interface GridShotHitFeedback { score: number; label: string; interval: number | null; combo: number; stable: boolean }
export const createHitFeedback = (scored: HitScoreBreakdown, combo: number): GridShotHitFeedback => ({ score: scored.total, label: scored.speedLabel, interval: scored.interval, combo, stable: scored.stabilityBonus > 0 });
export const comboMilestone = (combo: number) => [10, 20, 30, 50].includes(combo) ? { combo, subtitle: combo >= 50 ? "HIGH FLOW" : "RHYTHM STABLE" } : null;
export const shouldShowRecordPace = (percent: number, alreadyShown: boolean) => !alreadyShown && percent >= 5;
