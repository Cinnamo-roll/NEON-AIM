export type FovType = "horizontal" | "vertical" | "horizontal-4-3";

export const NEON_YAW_DEGREES_PER_COUNT = 0.022;
export const NEON_SENSITIVITY_MIN = 0.01;
export const NEON_SENSITIVITY_MAX = 10;
export const MOUSE_DPI_MIN = 50;
export const MOUSE_DPI_MAX = 32_000;
export const HORIZONTAL_RATIO_MIN = 0.1;
export const HORIZONTAL_RATIO_MAX = 2;
export const VERTICAL_RATIO_MIN = 0.1;
export const VERTICAL_RATIO_MAX = 2;

export interface CanonicalSensitivity {
  mouseDpi: number;
  cmPer360: number;
  radiansPerMouseCount: number;
}

export interface NeonInputSettings {
  sensitivity: number;
  mouseDpi: number;
  horizontalRatio: number;
  verticalRatio: number;
}

export interface NeonInputSensitivity extends CanonicalSensitivity, NeonInputSettings {}

export interface GameSensitivityProfile {
  id: string;
  name: string;
  aliases: string[];
  sensitivityMin: number;
  sensitivityMax: number;
  sensitivityStep: number;
  yawCoefficient?: number;
  defaultFov?: number;
  fovType: FovType;
  supportsAds: boolean;
  status: "verified" | "beta" | "manual-calibration";
}

export const profiles: GameSensitivityProfile[] = [
  { id: "neon", name: "NEON AIM", aliases: ["neon"], sensitivityMin: NEON_SENSITIVITY_MIN, sensitivityMax: NEON_SENSITIVITY_MAX, sensitivityStep: 0.001, yawCoefficient: NEON_YAW_DEGREES_PER_COUNT, defaultFov: 82, fovType: "vertical", supportsAds: false, status: "verified" },
  { id: "cs2", name: "Counter-Strike 2 / CS:GO", aliases: ["cs2", "csgo"], sensitivityMin: 0.01, sensitivityMax: 20, sensitivityStep: 0.001, yawCoefficient: 0.022, defaultFov: 90, fovType: "horizontal-4-3", supportsAds: false, status: "verified" },
  { id: "valorant", name: "VALORANT", aliases: ["val"], sensitivityMin: 0.01, sensitivityMax: 10, sensitivityStep: 0.001, yawCoefficient: 0.07, defaultFov: 103, fovType: "horizontal", supportsAds: false, status: "verified" },
  { id: "apex", name: "Apex Legends", aliases: ["apex"], sensitivityMin: 0.01, sensitivityMax: 20, sensitivityStep: 0.001, yawCoefficient: 0.022, defaultFov: 90, fovType: "horizontal-4-3", supportsAds: false, status: "verified" },
  { id: "overwatch-2", name: "Overwatch 2", aliases: ["ow2", "overwatch"], sensitivityMin: 0.01, sensitivityMax: 100, sensitivityStep: 0.001, yawCoefficient: 0.0066, defaultFov: 103, fovType: "horizontal", supportsAds: false, status: "verified" },
  { id: "call-of-duty", name: "Call of Duty / Warzone", aliases: ["cod", "warzone"], sensitivityMin: 0.01, sensitivityMax: 100, sensitivityStep: 0.001, yawCoefficient: 0.0066, defaultFov: 100, fovType: "horizontal", supportsAds: false, status: "verified" },
  { id: "fortnite", name: "Fortnite (百分比)", aliases: ["fn", "fortnite"], sensitivityMin: 0.1, sensitivityMax: 100, sensitivityStep: 0.001, yawCoefficient: 0.005555, defaultFov: 80, fovType: "horizontal", supportsAds: false, status: "verified" },
  { id: "rainbow-six", name: "Rainbow Six Siege", aliases: ["r6", "siege"], sensitivityMin: 1, sensitivityMax: 100, sensitivityStep: 0.001, yawCoefficient: 0.00223, defaultFov: 84, fovType: "vertical", supportsAds: false, status: "verified" },
];

const clampFinite = (value: number, fallback: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : fallback));

export const roundSensitivity = (value: number) => Math.round(value * 1000) / 1000;

export function normalizeNeonInputSettings(settings: NeonInputSettings): NeonInputSettings {
  return {
    sensitivity: roundSensitivity(clampFinite(settings.sensitivity, 0.55, NEON_SENSITIVITY_MIN, NEON_SENSITIVITY_MAX)),
    mouseDpi: Math.round(clampFinite(settings.mouseDpi, 800, MOUSE_DPI_MIN, MOUSE_DPI_MAX)),
    horizontalRatio: clampFinite(settings.horizontalRatio, 1, HORIZONTAL_RATIO_MIN, HORIZONTAL_RATIO_MAX),
    verticalRatio: clampFinite(settings.verticalRatio, 1, VERTICAL_RATIO_MIN, VERTICAL_RATIO_MAX),
  };
}

export function canonicalFromGame(
  sensitivity: number,
  dpi: number,
  yawCoefficient: number,
): CanonicalSensitivity {
  const safeSensitivity = clampFinite(sensitivity, 1, 0.000_001, 1000);
  const safeDpi = clampFinite(dpi, 800, 1, 100_000);
  const safeYawCoefficient = clampFinite(yawCoefficient, NEON_YAW_DEGREES_PER_COUNT, 0.000_001, 360);
  const radiansPerMouseCount = safeSensitivity * safeYawCoefficient * Math.PI / 180;
  return {
    mouseDpi: safeDpi,
    radiansPerMouseCount,
    cmPer360: 2 * Math.PI / radiansPerMouseCount / safeDpi * 2.54,
  };
}

/** The only formal NEON AIM sensitivity pipeline used by settings and gameplay. */
export function createNeonInputSensitivity(settings: NeonInputSettings): NeonInputSensitivity {
  const normalized = normalizeNeonInputSettings(settings);
  const base = canonicalFromGame(normalized.sensitivity, normalized.mouseDpi, NEON_YAW_DEGREES_PER_COUNT);
  const horizontal = canonicalFromGame(normalized.sensitivity * normalized.horizontalRatio, normalized.mouseDpi, NEON_YAW_DEGREES_PER_COUNT);
  return {
    ...normalized,
    radiansPerMouseCount: base.radiansPerMouseCount,
    cmPer360: horizontal.cmPer360,
  };
}

export function sensitivityFromCanonical(canonical: CanonicalSensitivity, yawCoefficient: number) {
  const safeYawCoefficient = clampFinite(yawCoefficient, NEON_YAW_DEGREES_PER_COUNT, 0.000_001, 360);
  return canonical.radiansPerMouseCount / (safeYawCoefficient * Math.PI / 180);
}

export function horizontalToVerticalFov(horizontal: number, aspect: number) {
  return 2 * Math.atan(Math.tan(horizontal * Math.PI / 360) / aspect) * 180 / Math.PI;
}

export function verticalToHorizontalFov(vertical: number, aspect: number) {
  return 2 * Math.atan(Math.tan(vertical * Math.PI / 360) * aspect) * 180 / Math.PI;
}
