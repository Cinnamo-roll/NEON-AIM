export const GRID_SHOT_GRADE_ORDER = ["D", "C", "B", "A", "S", "S+"] as const;

export type GridShotGrade = (typeof GRID_SHOT_GRADE_ORDER)[number];
export type GridShotGradeDimension = "accuracy" | "speed" | "consistency" | "control";

export interface GridShotGradeBand {
  minimum: number;
  grade: GridShotGrade;
}

export interface GridShotHardGate {
  accuracy: number;
  targetsPerMinute: number;
  consistency: number;
  maxCombo: number;
}

const descending = (...bands: GridShotGradeBand[]) => bands;

/**
 * Grid Shot grades deliberately exclude total score. Total score already rewards
 * speed, combo and stable rhythm, so including it here would count those skills
 * twice and allow inaccurate spam clicking to receive an elite grade.
 */
export const GRID_SHOT_GRADE_CONFIG = {
  weights: {
    accuracy: 0.4,
    speed: 0.25,
    consistency: 0.2,
    control: 0.15,
  },
  normalization: {
    targetsPerMinuteFor100: 180,
    maxComboFor100: 50,
  },
  overallBands: descending(
    { minimum: 93, grade: "S+" },
    { minimum: 85, grade: "S" },
    { minimum: 75, grade: "A" },
    { minimum: 60, grade: "B" },
    { minimum: 45, grade: "C" },
    { minimum: 0, grade: "D" },
  ),
  dimensionBands: {
    accuracy: descending(
      { minimum: 97, grade: "S+" },
      { minimum: 93, grade: "S" },
      { minimum: 88, grade: "A" },
      { minimum: 80, grade: "B" },
      { minimum: 70, grade: "C" },
      { minimum: 0, grade: "D" },
    ),
    speed: descending(
      { minimum: 190, grade: "S+" },
      { minimum: 170, grade: "S" },
      { minimum: 150, grade: "A" },
      { minimum: 125, grade: "B" },
      { minimum: 100, grade: "C" },
      { minimum: 0, grade: "D" },
    ),
    consistency: descending(
      { minimum: 92, grade: "S+" },
      { minimum: 85, grade: "S" },
      { minimum: 75, grade: "A" },
      { minimum: 70, grade: "B" },
      { minimum: 60, grade: "C" },
      { minimum: 0, grade: "D" },
    ),
    control: descending(
      { minimum: 60, grade: "S+" },
      { minimum: 50, grade: "S" },
      { minimum: 30, grade: "A" },
      { minimum: 20, grade: "B" },
      { minimum: 10, grade: "C" },
      { minimum: 0, grade: "D" },
    ),
  } satisfies Record<GridShotGradeDimension, GridShotGradeBand[]>,
  accuracyCaps: descending(
    { minimum: 97, grade: "S+" },
    { minimum: 93, grade: "S" },
    { minimum: 88, grade: "A" },
    { minimum: 80, grade: "B" },
    { minimum: 70, grade: "C" },
    { minimum: 0, grade: "D" },
  ),
  hardGates: {
    S: {
      accuracy: 93,
      targetsPerMinute: 150,
      consistency: 75,
      maxCombo: 30,
    },
    "S+": {
      accuracy: 97,
      targetsPerMinute: 180,
      consistency: 85,
      maxCombo: 50,
    },
  } satisfies Record<"S" | "S+", GridShotHardGate>,
} as const;
