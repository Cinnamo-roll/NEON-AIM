import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEmptyGridShotStats } from "../../game/scoring/gridShotSession";
import { TrainingHud } from "./TrainingHud";
import { DEFAULT_HUD_VISIBILITY, isHudInsideFullscreenRoot } from "./hudStructure";

describe("Grid Shot HUD", () => {
  it("keeps all essential default fields enabled", () => { expect(Object.values(DEFAULT_HUD_VISIBILITY).every(Boolean)).toBe(true); });
  it.each(["playing", "paused"])("renders real metrics while %s", () => { const stats = createEmptyGridShotStats(); Object.assign(stats, { score: 12480, accuracy: 91.4, hits: 72, shots: 79, combo: 18, maxCombo: 34, targetsPerMinute: 138 }); const html = renderToStaticMarkup(<TrainingHud stats={stats} remaining={38} fps={144} />); expect(html).toContain("12,480"); expect(html).toContain("00:38"); expect(html).toContain("91.4%"); expect(html).toContain("FPS"); expect(html).toContain("144"); expect(html).not.toContain("AHEAD OF BEST"); });
  it("marks the final three seconds as the last push", () => { const html = renderToStaticMarkup(<TrainingHud stats={createEmptyGridShotStats()} remaining={2.8} showFps={false} />); expect(html).toContain("final-three"); expect(html).toContain("最后冲刺"); expect(html).toContain("00:03"); });
  it("asserts that the HUD belongs to the fullscreen root", () => { const hud = {}; expect(isHudInsideFullscreenRoot({ contains: (node) => node === hud }, hud)).toBe(true); expect(isHudInsideFullscreenRoot({ contains: () => false }, hud)).toBe(false); });
});
