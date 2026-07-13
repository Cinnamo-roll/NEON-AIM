import type { TrainingSettings } from "../types/training";

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  sensitivity: 0.55,
  mouseDpi: 800,
  pollingRate: 1000,
  horizontalRatio: 1,
  verticalRatio: 1,
  fov: 82,
  invertX: false,
  invertY: false,
  volume: 0.55,
  muted: false,
  crosshair: "cross-dot",
  crosshairColor: "#71f6ff",
  crosshairThickness: 2,
  crosshairLength: 8,
  crosshairGap: 6,
  crosshairOpacity: 1,
  showHitMarker: true,
  lowSpec: false,
  antialiasEnabled: true,
  fpsLimit: "auto",
  renderScale: 1,
  dprMode: "auto",
  uiScale: 1,
  graphicsPreset: "high",
  particleQuality: "high",
  fogEnabled: true,
  dynamicGridEnabled: true,
  hudScale: 1,
  hudOpacity: 1,
  showFps: true,
  targetColor: "#c4fbff",
  targetSize: 1,
  hitVolume: 1,
  missVolume: 1,
  comboVolume: 1,
};

export type ConfigurableCategory = "input" | "crosshair" | "graphics" | "hud" | "audio";

export const CATEGORY_DEFAULTS: Record<ConfigurableCategory, Partial<TrainingSettings>> = {
  input: {
    sensitivity: DEFAULT_TRAINING_SETTINGS.sensitivity,
    mouseDpi: DEFAULT_TRAINING_SETTINGS.mouseDpi,
    horizontalRatio: DEFAULT_TRAINING_SETTINGS.horizontalRatio,
    verticalRatio: DEFAULT_TRAINING_SETTINGS.verticalRatio,
    invertX: DEFAULT_TRAINING_SETTINGS.invertX,
    invertY: DEFAULT_TRAINING_SETTINGS.invertY,
  },
  crosshair: {
    crosshair: DEFAULT_TRAINING_SETTINGS.crosshair,
    crosshairColor: DEFAULT_TRAINING_SETTINGS.crosshairColor,
    crosshairThickness: DEFAULT_TRAINING_SETTINGS.crosshairThickness,
    crosshairLength: DEFAULT_TRAINING_SETTINGS.crosshairLength,
    crosshairGap: DEFAULT_TRAINING_SETTINGS.crosshairGap,
    crosshairOpacity: DEFAULT_TRAINING_SETTINGS.crosshairOpacity,
    showHitMarker: DEFAULT_TRAINING_SETTINGS.showHitMarker,
  },
  graphics: {
    fpsLimit: DEFAULT_TRAINING_SETTINGS.fpsLimit,
    renderScale: DEFAULT_TRAINING_SETTINGS.renderScale,
    dprMode: DEFAULT_TRAINING_SETTINGS.dprMode,
    graphicsPreset: DEFAULT_TRAINING_SETTINGS.graphicsPreset,
    fov: DEFAULT_TRAINING_SETTINGS.fov,
    particleQuality: DEFAULT_TRAINING_SETTINGS.particleQuality,
    fogEnabled: DEFAULT_TRAINING_SETTINGS.fogEnabled,
    dynamicGridEnabled: DEFAULT_TRAINING_SETTINGS.dynamicGridEnabled,
    lowSpec: DEFAULT_TRAINING_SETTINGS.lowSpec,
    antialiasEnabled: DEFAULT_TRAINING_SETTINGS.antialiasEnabled,
  },
  hud: {
    hudScale: DEFAULT_TRAINING_SETTINGS.hudScale,
    hudOpacity: DEFAULT_TRAINING_SETTINGS.hudOpacity,
    showFps: DEFAULT_TRAINING_SETTINGS.showFps,
    targetColor: DEFAULT_TRAINING_SETTINGS.targetColor,
    targetSize: DEFAULT_TRAINING_SETTINGS.targetSize,
  },
  audio: {
    volume: DEFAULT_TRAINING_SETTINGS.volume,
    muted: DEFAULT_TRAINING_SETTINGS.muted,
    hitVolume: DEFAULT_TRAINING_SETTINGS.hitVolume,
    missVolume: DEFAULT_TRAINING_SETTINGS.missVolume,
    comboVolume: DEFAULT_TRAINING_SETTINGS.comboVolume,
  },
};

const GRAPHICS_PRESETS: Record<Exclude<TrainingSettings["graphicsPreset"], "custom">, Partial<TrainingSettings>> = {
  low: {
    graphicsPreset: "low",
    renderScale: 0.67,
    dprMode: 1,
    particleQuality: "off",
    fogEnabled: false,
    dynamicGridEnabled: false,
    lowSpec: true,
    antialiasEnabled: false,
  },
  medium: {
    graphicsPreset: "medium",
    renderScale: 0.85,
    dprMode: 1,
    particleQuality: "low",
    fogEnabled: true,
    dynamicGridEnabled: true,
    lowSpec: false,
    antialiasEnabled: true,
  },
  high: {
    graphicsPreset: "high",
    renderScale: 1,
    dprMode: "auto",
    particleQuality: "high",
    fogEnabled: true,
    dynamicGridEnabled: true,
    lowSpec: false,
    antialiasEnabled: true,
  },
  ultra: {
    graphicsPreset: "ultra",
    renderScale: 1.1,
    dprMode: 2,
    particleQuality: "high",
    fogEnabled: true,
    dynamicGridEnabled: true,
    lowSpec: false,
    antialiasEnabled: true,
  },
};

export function applyGraphicsPreset(
  settings: TrainingSettings,
  preset: TrainingSettings["graphicsPreset"],
): TrainingSettings {
  return preset === "custom"
    ? { ...settings, graphicsPreset: "custom" }
    : { ...settings, ...GRAPHICS_PRESETS[preset] };
}

const PRESET_CONTROLLED_GRAPHICS_KEYS: ReadonlyArray<keyof TrainingSettings> = [
  "renderScale",
  "dprMode",
  "particleQuality",
  "fogEnabled",
  "dynamicGridEnabled",
  "lowSpec",
  "antialiasEnabled",
];

export function patchCustomGraphics<K extends keyof TrainingSettings>(
  settings: TrainingSettings,
  key: K,
  value: TrainingSettings[K],
) {
  return PRESET_CONTROLLED_GRAPHICS_KEYS.includes(key)
    ? { ...settings, [key]: value, graphicsPreset: "custom" as const }
    : { ...settings, [key]: value };
}
