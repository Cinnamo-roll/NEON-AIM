import type { TrainingSettings } from "../types/training";

export type CrosshairPresetId = "cross" | "cross-dot" | "dot" | "circle" | "t-shape";

export type CrosshairStructure = Pick<
  TrainingSettings,
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
>;

export type CrosshairPreset = {
  id: CrosshairPresetId;
  label: string;
  parameters: CrosshairStructure;
};

const BASE_STRUCTURE: CrosshairStructure = {
  crosshairTop: true,
  crosshairBottom: true,
  crosshairLeft: true,
  crosshairRight: true,
  crosshairCenterDot: false,
  crosshairRing: false,
  crosshairThickness: 2,
  crosshairLength: 8,
  crosshairGap: 6,
  crosshairDotSize: 3,
  crosshairRingDiameter: 18,
};

export const CROSSHAIR_PRESETS: readonly CrosshairPreset[] = [
  { id: "cross", label: "十字", parameters: BASE_STRUCTURE },
  { id: "cross-dot", label: "十字点", parameters: { ...BASE_STRUCTURE, crosshairCenterDot: true } },
  { id: "dot", label: "圆点", parameters: { ...BASE_STRUCTURE, crosshairTop: false, crosshairBottom: false, crosshairLeft: false, crosshairRight: false, crosshairCenterDot: true, crosshairDotSize: 4 } },
  { id: "circle", label: "圆环", parameters: { ...BASE_STRUCTURE, crosshairTop: false, crosshairBottom: false, crosshairLeft: false, crosshairRight: false, crosshairRing: true } },
  { id: "t-shape", label: "T 型", parameters: { ...BASE_STRUCTURE, crosshairTop: false } },
] as const;

const STRUCTURE_KEYS = Object.keys(BASE_STRUCTURE) as Array<keyof CrosshairStructure>;

export function getCrosshairPreset(id: string) {
  return CROSSHAIR_PRESETS.find((preset) => preset.id === id);
}

export function applyCrosshairPreset(settings: TrainingSettings, id: CrosshairPresetId): TrainingSettings {
  const preset = getCrosshairPreset(id);
  return preset ? { ...settings, ...preset.parameters } : settings;
}

export function matchCrosshairPreset(settings: TrainingSettings): CrosshairPresetId | null {
  return CROSSHAIR_PRESETS.find((preset) => STRUCTURE_KEYS.every((key) => settings[key] === preset.parameters[key]))?.id ?? null;
}
