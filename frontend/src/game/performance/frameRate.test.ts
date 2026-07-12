import { describe, expect, it } from "vitest";
import {
  estimateRefreshRate,
  resolveFpsLimit,
  rotationFromCounts,
} from "./frameRate";
describe("frame rate system", () => {
  for (const hz of [60, 120, 144, 165, 240])
    it(`detects ${hz}Hz`, () =>
      expect(estimateRefreshRate(Array(180).fill(1000 / hz))).toBe(hz));
  it("auto follows detected refresh", () =>
    expect(resolveFpsLimit("auto", 165)).toBe(165));
  it("mouse rotation is frame independent", () => {
    const expected = rotationFromCounts(420, 0.0004);
    for (const fps of [60, 120, 144, 165, 240])
      expect((rotationFromCounts(420, 0.0004, 1) * fps) / fps).toBe(expected);
  });
});
