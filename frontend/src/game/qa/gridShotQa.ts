import type { TrainingState } from "../types/training";
export const GRID_SHOT_QA_DURATION = 15;
export const gridShotQaCapabilities = { requiresFullscreen: false, requiresPointerLock: false } as const;
export function qaJump(state: "countdown" | "playing" | "final-ten" | "finished"): { trainingState: TrainingState; remaining: number } { if (state === "countdown") return { trainingState: "countdown", remaining: GRID_SHOT_QA_DURATION }; if (state === "final-ten") return { trainingState: "playing", remaining: 9.8 }; if (state === "finished") return { trainingState: "finished", remaining: 0 }; return { trainingState: "playing", remaining: GRID_SHOT_QA_DURATION }; }
