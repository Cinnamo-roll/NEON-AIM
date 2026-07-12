import type {
  GridShotHistoryRecord,
  TrainingSettings,
} from "../types/training";
export const HISTORY_KEY = "neon-grid-shot-history-v1";
export const SETTINGS_KEY = "neon-settings";
export function readHistory(): GridShotHistoryRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 100) : [];
  } catch {
    return [];
  }
}
export function saveHistory(record: GridShotHistoryRecord) {
  const records = [record, ...readHistory()].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  return records;
}
export function gridShotBests() {
  const h = readHistory();
  return {
    score: Math.max(0, ...h.map((r) => r.score)),
    accuracy: Math.max(0, ...h.map((r) => r.accuracy)),
    tpm: Math.max(0,...h.map(r=>r.targetsPerMinute)),
    averageReaction: h.length
      ? Math.min(
          ...h
            .filter((r) => r.averageReactionTime > 0)
            .map((r) => r.averageReactionTime),
        )
      : 0,
  };
}
export function mergeSettings(defaults: TrainingSettings): TrainingSettings {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
    };
  } catch {
    return defaults;
  }
}
