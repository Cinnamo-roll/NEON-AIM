export const isHudInsideFullscreenRoot = (root: { contains(node: unknown): boolean } | null, hud: unknown) => Boolean(root && hud && root.contains(hud));
export const DEFAULT_HUD_VISIBILITY = { score: true, time: true, combo: true, accuracy: true, fps: true };
