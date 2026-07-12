import { describe, expect, it } from "vitest";
import { effectiveSoundLevel, type AudioLevelSource } from "./AudioManager";

const levels = (overrides: Partial<Record<keyof AudioLevelSource, number | boolean>> = {}): AudioLevelSource => ({
  master: () => Number(overrides.master ?? 0.5),
  hit: () => Number(overrides.hit ?? 0.8),
  miss: () => Number(overrides.miss ?? 0.6),
  combo: () => Number(overrides.combo ?? 0.4),
  muted: () => Boolean(overrides.muted ?? false),
});

describe("training audio levels", () => {
  it("applies independent hit, miss and combo volumes", () => {
    expect(effectiveSoundLevel("hit", levels())).toBeCloseTo(0.4);
    expect(effectiveSoundLevel("fast", levels())).toBeCloseTo(0.4);
    expect(effectiveSoundLevel("miss", levels())).toBeCloseTo(0.3);
    expect(effectiveSoundLevel("combo", levels())).toBeCloseTo(0.2);
    expect(effectiveSoundLevel("tick", levels())).toBeCloseTo(0.5);
  });

  it("honors mute and clamps invalid levels", () => {
    expect(effectiveSoundLevel("hit", levels({ muted: true }))).toBe(0);
    expect(effectiveSoundLevel("hit", levels({ master: 4, hit: -2 }))).toBe(0);
  });
});
