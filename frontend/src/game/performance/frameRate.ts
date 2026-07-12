export type FpsLimit =
  "auto" | 60 | 90 | 120 | 144 | 165 | 180 | 240 | 360 | "unlimited";
export const FPS_OPTIONS: FpsLimit[] = [
  "auto",
  60,
  90,
  120,
  144,
  165,
  180,
  240,
  360,
  "unlimited",
];
export function estimateRefreshRate(durations: number[]) {
  const clean = durations.filter((v) => v > 2 && v < 40).sort((a, b) => a - b);
  if (!clean.length) return 60;
  const median = clean[Math.floor(clean.length / 2)];
  const raw = 1000 / median;
  return [60, 75, 90, 100, 120, 144, 165, 180, 240, 360].reduce((a, b) =>
    Math.abs(b - raw) < Math.abs(a - raw) ? b : a,
  );
}
export function resolveFpsLimit(limit: FpsLimit, refresh: number) {
  return limit === "auto"
    ? estimateRefreshRate([1000 / refresh])
    : limit === "unlimited"
      ? Infinity
      : limit;
}
export interface FrameMetrics {
  current: number;
  average1s: number;
  average5s: number;
  min: number;
  onePercentLow: number;
  frameTime: number;
  p95: number;
  refreshRate: number;
  drawCalls: number;
  triangles: number;
  width: number;
  height: number;
}
export function calculateMetrics(
  samples: number[],
  refreshRate = 60,
): Omit<FrameMetrics, "drawCalls" | "triangles" | "width" | "height"> {
  const clean = samples.filter((v) => v > 0 && v < 250),
    sorted = [...clean].sort((a, b) => a - b),
    avg = (a: number[]) =>
      a.length ? a.reduce((x, y) => x + y, 0) / a.length : 16.67,
    p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 16.67,
    slow = sorted.slice(Math.floor(sorted.length * 0.99));
  return {
    current: 1000 / avg(clean.slice(-10)),
    average1s:
      1000 / avg(clean.slice(-Math.max(1, Math.round(1000 / avg(clean))))),
    average5s: 1000 / avg(clean),
    min: 1000 / (sorted.at(-1) ?? 16.67),
    onePercentLow: 1000 / avg(slow),
    frameTime: avg(clean),
    p95,
    refreshRate,
  };
}
export function rotationFromCounts(
  count: number,
  radiansPerCount: number,
  verticalRatio = 1,
) {
  return count * radiansPerCount * verticalRatio;
}
