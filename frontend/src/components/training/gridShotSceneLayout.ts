import type { GridShotHitEffectStyle } from "../../game/modes/gridShot/gridShotConfig";

export const GRID_SHOT_SAFE_POSITIONS = [
  [-3.45, 1.25, -5.9],
  [0, -0.2, -5.86],
  [3.45, -1.15, -5.94],
  [-2.3, -1.9, -5.84],
  [2.35, 1.9, -6.02],
] as const;

export const GRID_SHOT_PARTICLE_DIRECTIONS = [
  [-0.88, 0.22], [-0.62, 0.72], [-0.08, 0.94], [0.52, 0.77],
  [0.94, 0.18], [0.72, -0.62], [0.08, -0.92], [-0.7, -0.62],
  [-0.98, -0.1], [-0.83, 0.52], [-0.34, 0.91], [0.25, 0.96],
  [0.82, 0.54], [0.96, -0.28], [0.42, -0.9], [-0.42, -0.86],
] as const;

export function getGridShotParticleTransform(style: GridShotHitEffectStyle, index: number, hitProgress: number) {
  if (style === "off") return null;
  const direction = GRID_SHOT_PARTICLE_DIRECTIONS[index];
  if (!direction) return null;
  const delay = (index % 4) * 0.035;
  const progress = Math.min(1, Math.max(0, (hitProgress - delay) / 0.72));
  const travel = 1 - Math.pow(1 - progress, 2.4);
  const baseAngle = Math.atan2(direction[1], direction[0]);

  if (style === "spiral") {
    const turn = (0.32 + progress * (1.05 + (index % 3) * 0.14)) * (index % 2 === 0 ? 1 : -1);
    const angle = baseAngle + turn;
    const radius = 0.13 + travel * (0.56 + (index % 3) * 0.055);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, rotation: angle - Math.PI / 2, scaleX: 0.5, scaleY: Math.max(0.1, 0.92 - progress * 0.58), visible: progress < 1 };
  }

  if (style === "shards") {
    const bend = Math.sin(progress * Math.PI) * (0.13 + (index % 3) * 0.055) * (index % 2 === 0 ? 1 : -1);
    const angle = baseAngle + bend;
    const radius = 0.19 + travel * (0.62 + (index % 3) * 0.085);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, rotation: angle - Math.PI / 2 + bend * 1.8, scaleX: 0.46 + (index % 3) * 0.13, scaleY: Math.max(0.08, 1.08 - progress * 0.78), visible: progress < 1 };
  }

  const radius = 0.24 + travel * (0.52 + (index % 3) * 0.08);
  return { x: direction[0] * radius, y: direction[1] * radius, rotation: baseAngle - Math.PI / 2, scaleX: 0.72, scaleY: Math.max(0.08, 1 - progress * 0.72), visible: progress < 1 };
}

export function getGridShotImpactVisual(style: GridShotHitEffectStyle, hitProgress: number) {
  const progress = Math.min(1, Math.max(0, hitProgress));
  const enabled = style !== "off";
  const impactProgress = Math.min(1, progress / 0.92);
  const impactEase = 1 - Math.pow(1 - impactProgress, 3);
  return {
    targetScale: [
      Math.max(0.001, 0.8 * (1 - progress) * (1 + progress * 0.08)),
      Math.max(0.001, 0.8 * (1 - progress) * (1 + progress * 0.08)),
      Math.max(0.001, 0.8 * (1 - progress) * (1 - progress * 0.68)),
    ] as const,
    bodyOpacity: Math.max(0, 1 - progress * 1.15),
    coreOpacity: Math.max(0, 1 - progress),
    flashVisible: enabled && progress < 0.42,
    flashScale: 0.88 + impactEase * 0.3,
    flashOpacity: Math.max(0, (1 - progress / 0.42) * 0.58),
    ringVisible: style === "spiral" && progress < 1,
    ringScale: 0.86 + impactEase * 0.92,
    ringOpacity: Math.max(0, Math.pow(1 - impactProgress, 1.45) * 0.9),
    particlesVisible: enabled && progress < 0.88,
    particleOpacity: Math.max(0, Math.pow(1 - progress / 0.88, 1.35) * 0.78),
  };
}
