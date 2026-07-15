export type GridShotSpeedLabel = "FIRST" | "FLOW" | "FAST" | "GOOD" | "STEADY" | "SLOW";

export function speedBonus(interval: number | null) {
  if (interval === null) return { bonus: 0, label: "FIRST" as const };
  if (interval <= 180) return { bonus: 50, label: "FLOW" as const };
  if (interval <= 230) return { bonus: 40, label: "FAST" as const };
  if (interval <= 300) return { bonus: 30, label: "GOOD" as const };
  if (interval <= 400) return { bonus: 20, label: "STEADY" as const };
  if (interval <= 550) return { bonus: 10, label: "SLOW" as const };
  return { bonus: 0, label: "SLOW" as const };
}

export function comboBonus(combo: number) {
  return combo >= 50 ? 20 : combo >= 30 ? 15 : combo >= 20 ? 10 : combo >= 10 ? 5 : 0;
}

export function isStable(intervals: readonly number[]) {
  if (intervals.length < 5) return false;
  const recent = intervals.slice(-5);
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  if (mean <= 0) return false;
  const variance = recent.reduce((sum, value) => sum + (value - mean) ** 2, 0) / recent.length;
  return Math.sqrt(variance) / mean <= 0.16;
}
