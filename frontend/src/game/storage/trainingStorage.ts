import type {
  GridShotHistoryRecord,
  TrainingSettings,
} from "../types/training";
const LEGACY_HISTORY_KEYS = ["neon-grid-shot-history-v1"];
export const HISTORY_KEY = "neon-grid-shot-history-v2";
export const SETTINGS_KEY = "neon-settings";
export function readHistory(): GridShotHistoryRecord[] {
  try {
    LEGACY_HISTORY_KEYS.forEach((key) => localStorage.removeItem(key));
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 100) : [];
  } catch {
    return [];
  }
}
export function saveHistoryRecord(record: GridShotHistoryRecord): GridShotHistoryRecord[] {
  const history = [record, ...readHistory().filter((item) => item.sessionId !== record.sessionId)].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  return history;
}
export function mergeSettings(defaults: TrainingSettings): TrainingSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Record<string, unknown>;
    const known = Object.fromEntries(
      (Object.keys(defaults) as Array<keyof TrainingSettings>)
        .filter((key) => saved[key] !== undefined)
        .map((key) => [key, saved[key]]),
    ) as Partial<TrainingSettings>;
    return {
      ...defaults,
      ...known,
    };
  } catch {
    return defaults;
  }
}
