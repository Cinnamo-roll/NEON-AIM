import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  calculateMetrics,
  estimateRefreshRate,
  type FpsLimit,
} from "./frameRate";
import { usePerformanceStore } from "./performanceStore";
export function BrowserFrameMonitor() {
  const set = usePerformanceStore((s) => s.setMetrics);
  useEffect(() => {
    let raf = 0,
      last = performance.now(),
      shown = performance.now(),
      samples: number[] = [];
    const loop = (now: number) => {
      if (!document.hidden) {
        samples.push(now - last);
        if (samples.length > 1000) samples = samples.slice(-1000);
        if (now - shown > 250) {
          const base = calculateMetrics(
            samples,
            estimateRefreshRate(samples.slice(0, 180)),
          );
          set({
            ...base,
            drawCalls: 0,
            triangles: 0,
            width: innerWidth,
            height: innerHeight,
          });
          shown = now;
        }
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [set]);
  return null;
}
export function CanvasPerformanceMonitor() {
  const { gl } = useThree(),
    set = usePerformanceStore((s) => s.setMetrics),
    samples = useRef<number[]>([]),
    shown = useRef(0);
  useFrame((_, delta) => {
    if (document.hidden) return;
    samples.current.push(delta * 1000);
    if (samples.current.length > 1000) samples.current.shift();
    const now = performance.now();
    if (now - shown.current > 250) {
      const base = calculateMetrics(
        samples.current,
        estimateRefreshRate(samples.current.slice(0, 180)),
      );
      set({
        ...base,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        width: gl.domElement.width,
        height: gl.domElement.height,
      });
      shown.current = now;
    }
  });
  return null;
}
export function RenderScheduler({ limit }: { limit: FpsLimit }) {
  const { invalidate } = useThree();
  useEffect(() => {
    if (limit === "auto" || limit === "unlimited") return;
    let raf = 0,
      last = 0;
    const interval = 1000 / limit;
    const loop = (now: number) => {
      if (now - last >= interval) {
        last = now - ((now - last) % interval);
        invalidate();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [invalidate, limit]);
  return null;
}
