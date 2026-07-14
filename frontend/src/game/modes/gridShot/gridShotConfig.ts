export type GridShotDuration = 30 | 60 | 90;
export type GridShotSceneId = "training-cabin";
export type GridShotHitEffectStyle = "off" | "radial" | "shards" | "spiral";
export type GridShotTargetSize = "small" | "medium" | "large";
export type GridShotSessionType = "benchmark" | "practice";

export const GRID_SHOT_MODE_VERSION = 1;
export const GRID_SHOT_SCORING_VERSION = 1;
export const GRID_SHOT_BENCHMARK = {
  duration: 60,
  targetSize: "medium",
  activeTargetCount: 3,
  modeVersion: GRID_SHOT_MODE_VERSION,
  scoringVersion: GRID_SHOT_SCORING_VERSION,
  configurationKey: "grid-shot:60s:medium",
} as const;

export function applyGridShotBenchmarkRules(
  settings: GridShotModeSettings,
): GridShotModeSettings {
  return {
    ...settings,
    duration: GRID_SHOT_BENCHMARK.duration,
    targetSize: GRID_SHOT_BENCHMARK.targetSize,
  };
}

export interface GridShotModeSettings {
  duration: GridShotDuration;
  targetSize: GridShotTargetSize;
  sceneId: GridShotSceneId;
  hitEffectStyle: GridShotHitEffectStyle;
  screenGlow: number;
  hitVolume: number;
  missVolume: number;
  comboVolume: number;
}

export interface GridShotSceneDefinition {
  id: GridShotSceneId;
  name: string;
  description: string;
  camera: { fov: number; position: readonly [number, number, number] };
  environment: { background: string; fog: string; fogNear: number; fogFar: number; dynamicGrid: boolean };
  target: {
    color: string;
    emissive: string;
    normalImpact: string;
    fastImpact: string;
    comboImpact: string;
  };
}

export const GRID_SHOT_SCENES: readonly GridShotSceneDefinition[] = [
  {
    id: "training-cabin",
    name: "训练舱",
    description: "低干扰竞技训练空间，强调目标轮廓与连续点击节奏。",
    camera: { fov: 82, position: [0, 0.2, 1.2] },
    environment: { background: "#081119", fog: "#081119", fogNear: 10, fogFar: 27, dynamicGrid: true },
    target: {
      color: "#c4fbff",
      emissive: "#4d9fa9",
      normalImpact: "#63e5ee",
      fastImpact: "#d8fdff",
      comboImpact: "#ffd27d",
    },
  },
] as const;

export const DEFAULT_GRID_SHOT_SETTINGS: GridShotModeSettings = {
  duration: 60,
  targetSize: "medium",
  sceneId: "training-cabin",
  hitEffectStyle: "shards",
  screenGlow: 0.55,
  hitVolume: 1,
  missVolume: 1,
  comboVolume: 1,
};

export const GRID_SHOT_TARGET_SIZES: ReadonlyArray<{
  id: GridShotTargetSize;
  label: string;
  note: string;
  scale: number;
}> = [
  { id: "small", label: "小", note: "精准挑战", scale: 0.82 },
  { id: "medium", label: "中", note: "标准尺寸", scale: 1 },
  { id: "large", label: "大", note: "快速热身", scale: 1.18 },
];

export const GRID_SHOT_CONFIG = {
  activeTargetCount: 3,
  view: {
    yawMin: -Math.PI / 2,
    yawMax: Math.PI / 2,
  },
} as const;

const DURATIONS: GridShotDuration[] = [30, 60, 90];
const SCENE_IDS: GridShotSceneId[] = GRID_SHOT_SCENES.map((scene) => scene.id);
const EFFECT_STYLES: GridShotHitEffectStyle[] = ["off", "radial", "shards", "spiral"];
const TARGET_SIZE_IDS: GridShotTargetSize[] = GRID_SHOT_TARGET_SIZES.map((size) => size.id);

export function getGridShotScene(sceneId: GridShotSceneId) {
  return GRID_SHOT_SCENES.find((scene) => scene.id === sceneId) ?? GRID_SHOT_SCENES[0];
}

export function gridShotParticleCount(style: GridShotHitEffectStyle) {
  return style === "off" ? 0 : style === "radial" ? 8 : 12;
}

export function getGridShotTargetSize(size: GridShotTargetSize) {
  return GRID_SHOT_TARGET_SIZES.find((option) => option.id === size) ?? GRID_SHOT_TARGET_SIZES[1];
}

export function isGridShotBenchmarkSettings(
  settings: { duration: number; targetSize: GridShotTargetSize },
) {
  return settings.duration === GRID_SHOT_BENCHMARK.duration
    && settings.targetSize === GRID_SHOT_BENCHMARK.targetSize;
}

export function isGridShotBenchmarkConfiguration(
  configurationKey: string,
  modeVersion = GRID_SHOT_MODE_VERSION,
  scoringVersion = GRID_SHOT_SCORING_VERSION,
) {
  return configurationKey === GRID_SHOT_BENCHMARK.configurationKey
    && modeVersion === GRID_SHOT_BENCHMARK.modeVersion
    && scoringVersion === GRID_SHOT_BENCHMARK.scoringVersion;
}

function sanitizeTargetSize(value: unknown): GridShotTargetSize {
  if (TARGET_SIZE_IDS.includes(value as GridShotTargetSize)) return value as GridShotTargetSize;
  const legacyScale = Number(value);
  if (!Number.isFinite(legacyScale)) return DEFAULT_GRID_SHOT_SETTINGS.targetSize;
  return GRID_SHOT_TARGET_SIZES.reduce((closest, option) => (
    Math.abs(option.scale - legacyScale) < Math.abs(closest.scale - legacyScale) ? option : closest
  )).id;
}

export function sanitizeGridShotModeSettings(candidate: unknown): GridShotModeSettings {
  const source = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
  const rawDuration = Number(source.duration);
  const duration = DURATIONS.includes(rawDuration as GridShotDuration)
    ? rawDuration as GridShotDuration
    : DEFAULT_GRID_SHOT_SETTINGS.duration;
  const rawEffectStyle = source.hitEffectStyle ?? source.hitEffectLevel;
  const migratedEffectStyle = rawEffectStyle === "clean"
    ? "radial"
    : rawEffectStyle === "standard"
      ? "shards"
      : rawEffectStyle === "enhanced"
        ? "spiral"
        : rawEffectStyle;
  return {
    duration,
    targetSize: sanitizeTargetSize(source.targetSize),
    sceneId: SCENE_IDS.includes(source.sceneId as GridShotSceneId)
      ? source.sceneId as GridShotSceneId
      : DEFAULT_GRID_SHOT_SETTINGS.sceneId,
    hitEffectStyle: EFFECT_STYLES.includes(migratedEffectStyle as GridShotHitEffectStyle)
      ? migratedEffectStyle as GridShotHitEffectStyle
      : DEFAULT_GRID_SHOT_SETTINGS.hitEffectStyle,
    screenGlow: clampVolume(source.screenGlow, DEFAULT_GRID_SHOT_SETTINGS.screenGlow),
    hitVolume: clampVolume(source.hitVolume, DEFAULT_GRID_SHOT_SETTINGS.hitVolume),
    missVolume: clampVolume(source.missVolume, DEFAULT_GRID_SHOT_SETTINGS.missVolume),
    comboVolume: clampVolume(source.comboVolume, DEFAULT_GRID_SHOT_SETTINGS.comboVolume),
  };
}

function clampVolume(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : fallback;
}
