import { describe, expect, it } from "vitest";
import { interfaceSoundLevel } from "./interfaceAudio";

describe("interface audio", () => {
  it("honors mute and clamps the master volume", () => {
    expect(interfaceSoundLevel(0.55, false)).toBeCloseTo(0.55);
    expect(interfaceSoundLevel(3, false)).toBe(1);
    expect(interfaceSoundLevel(-1, false)).toBe(0);
    expect(interfaceSoundLevel(0.7, true)).toBe(0);
    expect(interfaceSoundLevel(Number.NaN, false)).toBe(0);
  });
});
