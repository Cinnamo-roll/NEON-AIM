import type { TrainingSettings } from "../types/training";
import { getCrosshairPreset } from "./crosshairPresets";

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = {
  sensitivity: 0.55,
  mouseDpi: 800,
  horizontalRatio: 1,
  verticalRatio: 1,
  invertX: false,
  invertY: false,
  volume: 0.55,
  muted: false,
  interfaceVolume: 0.9,
  interfaceMuted: false,
  language: "zh-CN",
  crosshairColor: "#71f6ff",
  crosshairTop: true,
  crosshairBottom: true,
  crosshairLeft: true,
  crosshairRight: true,
  crosshairCenterDot: true,
  crosshairRing: false,
  crosshairThickness: 2,
  crosshairLength: 8,
  crosshairGap: 6,
  crosshairDotSize: 3,
  crosshairRingDiameter: 18,
  crosshairOpacity: 1,
  lowSpec: false,
  antialiasEnabled: true,
  fpsLimit: "auto",
  renderScale: 1,
  dprMode: "auto",
  graphicsPreset: "high",
  hudScale: 1,
  hudOpacity: 1,
  showFps: true,
};

export type ConfigurableCategory = "general" | "input" | "crosshair" | "graphics" | "hud" | "audio";

export const CATEGORY_DEFAULTS: Record<ConfigurableCategory, Partial<TrainingSettings>> = {
  general: {
    language: DEFAULT_TRAINING_SETTINGS.language,
  },
  input: {
    sensitivity: DEFAULT_TRAINING_SETTINGS.sensitivity,
    mouseDpi: DEFAULT_TRAINING_SETTINGS.mouseDpi,
    horizontalRatio: DEFAULT_TRAINING_SETTINGS.horizontalRatio,
    verticalRatio: DEFAULT_TRAINING_SETTINGS.verticalRatio,
    invertX: DEFAULT_TRAINING_SETTINGS.invertX,
    invertY: DEFAULT_TRAINING_SETTINGS.invertY,
  },
  crosshair: {
    crosshairColor: DEFAULT_TRAINING_SETTINGS.crosshairColor,
    crosshairTop: DEFAULT_TRAINING_SETTINGS.crosshairTop,
    crosshairBottom: DEFAULT_TRAINING_SETTINGS.crosshairBottom,
    crosshairLeft: DEFAULT_TRAINING_SETTINGS.crosshairLeft,
    crosshairRight: DEFAULT_TRAINING_SETTINGS.crosshairRight,
    crosshairCenterDot: DEFAULT_TRAINING_SETTINGS.crosshairCenterDot,
    crosshairRing: DEFAULT_TRAINING_SETTINGS.crosshairRing,
    crosshairThickness: DEFAULT_TRAINING_SETTINGS.crosshairThickness,
    crosshairLength: DEFAULT_TRAINING_SETTINGS.crosshairLength,
    crosshairGap: DEFAULT_TRAINING_SETTINGS.crosshairGap,
    crosshairDotSize: DEFAULT_TRAINING_SETTINGS.crosshairDotSize,
    crosshairRingDiameter: DEFAULT_TRAINING_SETTINGS.crosshairRingDiameter,
    crosshairOpacity: DEFAULT_TRAINING_SETTINGS.crosshairOpacity,
  },
  graphics: {
    fpsLimit: DEFAULT_TRAINING_SETTINGS.fpsLimit,
    renderScale: DEFAULT_TRAINING_SETTINGS.renderScale,
    dprMode: DEFAULT_TRAINING_SETTINGS.dprMode,
    graphicsPreset: DEFAULT_TRAINING_SETTINGS.graphicsPreset,
    lowSpec: DEFAULT_TRAINING_SETTINGS.lowSpec,
    antialiasEnabled: DEFAULT_TRAINING_SETTINGS.antialiasEnabled,
  },
  hud: {
    hudScale: DEFAULT_TRAINING_SETTINGS.hudScale,
    hudOpacity: DEFAULT_TRAINING_SETTINGS.hudOpacity,
    showFps: DEFAULT_TRAINING_SETTINGS.showFps,
  },
  audio: {
    volume: DEFAULT_TRAINING_SETTINGS.volume,
    muted: DEFAULT_TRAINING_SETTINGS.muted,
    interfaceVolume: DEFAULT_TRAINING_SETTINGS.interfaceVolume,
    interfaceMuted: DEFAULT_TRAINING_SETTINGS.interfaceMuted,
  },
};

const GRAPHICS_PRESETS: Record<Exclude<TrainingSettings["graphicsPreset"], "custom">, Partial<TrainingSettings>> = {
  low: {
    graphicsPreset: "low",
    renderScale: 0.67,
    dprMode: 1,
    lowSpec: true,
    antialiasEnabled: false,
  },
  medium: {
    graphicsPreset: "medium",
    renderScale: 0.85,
    dprMode: 1,
    lowSpec: false,
    antialiasEnabled: true,
  },
  high: {
    graphicsPreset: "high",
    renderScale: 1,
    dprMode: "auto",
    lowSpec: false,
    antialiasEnabled: true,
  },
  ultra: {
    graphicsPreset: "ultra",
    renderScale: 1.1,
    dprMode: 2,
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

export function sanitizeTrainingSettings(candidate: unknown): TrainingSettings {
  const source = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
  const legacyCrosshair = typeof source.crosshair === "string"
    ? getCrosshairPreset(source.crosshair)?.parameters ?? {}
    : {};
  const known = Object.fromEntries(
    (Object.keys(DEFAULT_TRAINING_SETTINGS) as Array<keyof TrainingSettings>)
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  ) as Partial<TrainingSettings>;
  const merged = { ...DEFAULT_TRAINING_SETTINGS, ...legacyCrosshair, ...known };
  const interfaceVolume = Number(merged.interfaceVolume);
  return {
    ...merged,
    language: merged.language === "en-US" ? "en-US" : "zh-CN",
    interfaceVolume: Number.isFinite(interfaceVolume) ? Math.min(1, Math.max(0, interfaceVolume)) : DEFAULT_TRAINING_SETTINGS.interfaceVolume,
    interfaceMuted: Boolean(merged.interfaceMuted),
  };
}
