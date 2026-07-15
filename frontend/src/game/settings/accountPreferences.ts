import type { GridShotModeSettings, GridShotSessionType } from "../modes/gridShot/gridShotConfig";
import { applyGridShotBenchmarkRules, sanitizeGridShotModeSettings } from "../modes/gridShot/gridShotConfig";
import { FPS_OPTIONS } from "../performance/frameRate";
import { normalizeNeonInputSettings } from "../sensitivity/sensitivity";
import type { TrainingSettings } from "../types/training";

export const ACCOUNT_PREFERENCES_SCHEMA_VERSION = 1 as const;
export const DEVICE_SETTINGS_STORAGE_KEY = "neon-device-settings";
export const GRID_SHOT_DEVICE_SETTINGS_STORAGE_KEY = "neon-grid-shot-device-settings";
export const GUEST_ACCOUNT_PREFERENCES_STORAGE_KEY = "neon-guest-account-preferences";

type AccountTrainingSettings = Pick<TrainingSettings,
  | "language"
  | "sensitivity"
  | "mouseDpi"
  | "horizontalRatio"
  | "verticalRatio"
  | "invertX"
  | "invertY"
  | "crosshairColor"
  | "crosshairTop"
  | "crosshairBottom"
  | "crosshairLeft"
  | "crosshairRight"
  | "crosshairCenterDot"
  | "crosshairRing"
  | "crosshairThickness"
  | "crosshairLength"
  | "crosshairGap"
  | "crosshairDotSize"
  | "crosshairRingDiameter"
  | "crosshairOpacity"
>;

type GridShotAccountPreferences = {
  sessionType: GridShotSessionType;
  mode: Pick<GridShotModeSettings, "duration" | "targetSize" | "sceneId">;
};

export type AccountPreferenceDocument = {
  schemaVersion: typeof ACCOUNT_PREFERENCES_SCHEMA_VERSION;
  settings: AccountTrainingSettings;
  projects: {
    "grid-shot": GridShotAccountPreferences;
  };
};

export type RuntimePreferences = {
  settings: TrainingSettings;
  gridShotSettings: GridShotModeSettings;
  gridShotSessionType: GridShotSessionType;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number, integer = false) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(maximum, Math.max(minimum, numeric));
  return integer ? Math.round(clamped) : clamped;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function createAccountPreferenceDocument(
  settings: TrainingSettings,
  gridShotSettings: GridShotModeSettings,
  gridShotSessionType: GridShotSessionType,
): AccountPreferenceDocument {
  return {
    schemaVersion: ACCOUNT_PREFERENCES_SCHEMA_VERSION,
    settings: {
      language: settings.language,
      sensitivity: settings.sensitivity,
      mouseDpi: settings.mouseDpi,
      horizontalRatio: settings.horizontalRatio,
      verticalRatio: settings.verticalRatio,
      invertX: settings.invertX,
      invertY: settings.invertY,
      crosshairColor: settings.crosshairColor,
      crosshairTop: settings.crosshairTop,
      crosshairBottom: settings.crosshairBottom,
      crosshairLeft: settings.crosshairLeft,
      crosshairRight: settings.crosshairRight,
      crosshairCenterDot: settings.crosshairCenterDot,
      crosshairRing: settings.crosshairRing,
      crosshairThickness: settings.crosshairThickness,
      crosshairLength: settings.crosshairLength,
      crosshairGap: settings.crosshairGap,
      crosshairDotSize: settings.crosshairDotSize,
      crosshairRingDiameter: settings.crosshairRingDiameter,
      crosshairOpacity: settings.crosshairOpacity,
    },
    projects: {
      "grid-shot": {
        sessionType: gridShotSessionType,
        mode: {
          duration: gridShotSettings.duration,
          targetSize: gridShotSettings.targetSize,
          sceneId: gridShotSettings.sceneId,
        },
      },
    },
  };
}

export function applyAccountPreferenceDocument(
  current: RuntimePreferences,
  candidate: unknown,
): RuntimePreferences {
  const root = record(candidate);
  if (root.schemaVersion !== ACCOUNT_PREFERENCES_SCHEMA_VERSION) return current;
  const source = record(root.settings);
  const crosshairColor = typeof source.crosshairColor === "string" && /^#[\da-f]{6}$/i.test(source.crosshairColor)
    ? source.crosshairColor
    : current.settings.crosshairColor;
  const input = normalizeNeonInputSettings({
    sensitivity: finite(source.sensitivity, current.settings.sensitivity, 0.01, 10),
    mouseDpi: finite(source.mouseDpi, current.settings.mouseDpi, 50, 32_000, true),
    horizontalRatio: finite(source.horizontalRatio, current.settings.horizontalRatio, 0.1, 2),
    verticalRatio: finite(source.verticalRatio, current.settings.verticalRatio, 0.1, 2),
  });
  const settings: TrainingSettings = {
    ...current.settings,
    ...input,
    language: source.language === "en-US" || source.language === "zh-CN"
      ? source.language
      : current.settings.language,
    invertX: bool(source.invertX, current.settings.invertX),
    invertY: bool(source.invertY, current.settings.invertY),
    crosshairColor,
    crosshairTop: bool(source.crosshairTop, current.settings.crosshairTop),
    crosshairBottom: bool(source.crosshairBottom, current.settings.crosshairBottom),
    crosshairLeft: bool(source.crosshairLeft, current.settings.crosshairLeft),
    crosshairRight: bool(source.crosshairRight, current.settings.crosshairRight),
    crosshairCenterDot: bool(source.crosshairCenterDot, current.settings.crosshairCenterDot),
    crosshairRing: bool(source.crosshairRing, current.settings.crosshairRing),
    crosshairThickness: finite(source.crosshairThickness, current.settings.crosshairThickness, 1, 5, true),
    crosshairLength: finite(source.crosshairLength, current.settings.crosshairLength, 2, 20, true),
    crosshairGap: finite(source.crosshairGap, current.settings.crosshairGap, 0, 14, true),
    crosshairDotSize: finite(source.crosshairDotSize, current.settings.crosshairDotSize, 1, 8, true),
    crosshairRingDiameter: finite(source.crosshairRingDiameter, current.settings.crosshairRingDiameter, 8, 40, true),
    crosshairOpacity: finite(source.crosshairOpacity, current.settings.crosshairOpacity, 0.2, 1),
  };

  const project = record(record(root.projects)["grid-shot"]);
  const mode = record(project.mode);
  const selectedGridShotSettings = sanitizeGridShotModeSettings({
    ...current.gridShotSettings,
    ...(mode.duration === 30 || mode.duration === 60 || mode.duration === 90 ? { duration: mode.duration } : {}),
    ...(mode.targetSize === "small" || mode.targetSize === "medium" || mode.targetSize === "large"
      ? { targetSize: mode.targetSize }
      : {}),
    ...(mode.sceneId === "training-cabin" ? { sceneId: mode.sceneId } : {}),
  });
  const gridShotSessionType = project.sessionType === "benchmark" || project.sessionType === "practice"
    ? project.sessionType
    : current.gridShotSessionType;
  const gridShotSettings = gridShotSessionType === "benchmark"
    ? applyGridShotBenchmarkRules(selectedGridShotSettings)
    : selectedGridShotSettings;
  return { settings, gridShotSettings, gridShotSessionType };
}

export function deviceTrainingSettings(settings: TrainingSettings) {
  return {
    volume: settings.volume,
    muted: settings.muted,
    interfaceVolume: settings.interfaceVolume,
    interfaceMuted: settings.interfaceMuted,
    lowSpec: settings.lowSpec,
    antialiasEnabled: settings.antialiasEnabled,
    fpsLimit: settings.fpsLimit,
    renderScale: settings.renderScale,
    dprMode: settings.dprMode,
    graphicsPreset: settings.graphicsPreset,
    hudScale: settings.hudScale,
    hudOpacity: settings.hudOpacity,
    showFps: settings.showFps,
  } satisfies Partial<TrainingSettings>;
}

export function applyDeviceTrainingSettings(current: TrainingSettings, candidate: unknown): TrainingSettings {
  const source = record(candidate);
  const fpsLimit = FPS_OPTIONS.includes(source.fpsLimit as TrainingSettings["fpsLimit"])
    ? source.fpsLimit as TrainingSettings["fpsLimit"]
    : current.fpsLimit;
  const dprModes: TrainingSettings["dprMode"][] = ["auto", 1, 1.25, 1.5, 1.75, 2];
  const graphicsPresets: TrainingSettings["graphicsPreset"][] = ["low", "medium", "high", "ultra", "custom"];
  return {
    ...current,
    volume: finite(source.volume, current.volume, 0, 1),
    muted: bool(source.muted, current.muted),
    interfaceVolume: finite(source.interfaceVolume, current.interfaceVolume, 0, 1),
    interfaceMuted: bool(source.interfaceMuted, current.interfaceMuted),
    lowSpec: bool(source.lowSpec, current.lowSpec),
    antialiasEnabled: bool(source.antialiasEnabled, current.antialiasEnabled),
    fpsLimit,
    renderScale: finite(source.renderScale, current.renderScale, 0.5, 1.25),
    dprMode: dprModes.includes(source.dprMode as TrainingSettings["dprMode"])
      ? source.dprMode as TrainingSettings["dprMode"]
      : current.dprMode,
    graphicsPreset: graphicsPresets.includes(source.graphicsPreset as TrainingSettings["graphicsPreset"])
      ? source.graphicsPreset as TrainingSettings["graphicsPreset"]
      : current.graphicsPreset,
    hudScale: finite(source.hudScale, current.hudScale, 0.7, 1.4),
    hudOpacity: finite(source.hudOpacity, current.hudOpacity, 0.2, 1),
    showFps: bool(source.showFps, current.showFps),
  };
}

export function gridShotDeviceSettings(settings: GridShotModeSettings) {
  return {
    hitEffectStyle: settings.hitEffectStyle,
    screenGlow: settings.screenGlow,
    hitVolume: settings.hitVolume,
    missVolume: settings.missVolume,
    comboVolume: settings.comboVolume,
  } satisfies Partial<GridShotModeSettings>;
}

export function applyGridShotDeviceSettings(current: GridShotModeSettings, candidate: unknown) {
  const source = record(candidate);
  return sanitizeGridShotModeSettings({
    ...current,
    ...(source.hitEffectStyle === "off" || source.hitEffectStyle === "radial"
      || source.hitEffectStyle === "shards" || source.hitEffectStyle === "spiral"
      ? { hitEffectStyle: source.hitEffectStyle }
      : {}),
    screenGlow: finite(source.screenGlow, current.screenGlow, 0, 1),
    hitVolume: finite(source.hitVolume, current.hitVolume, 0, 1),
    missVolume: finite(source.missVolume, current.missVolume, 0, 1),
    comboVolume: finite(source.comboVolume, current.comboVolume, 0, 1),
  });
}
