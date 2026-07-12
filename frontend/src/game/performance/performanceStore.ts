import { create } from "zustand";
import type { FrameMetrics } from "./frameRate";
const empty: FrameMetrics = {
  current: 0,
  average1s: 0,
  average5s: 0,
  min: 0,
  onePercentLow: 0,
  frameTime: 0,
  p95: 0,
  refreshRate: 0,
  drawCalls: 0,
  triangles: 0,
  width: 0,
  height: 0,
};
export const usePerformanceStore = create<{
  metrics: FrameMetrics;
  setMetrics: (m: FrameMetrics) => void;
}>((set) => ({ metrics: empty, setMetrics: (metrics) => set({ metrics }) }));
