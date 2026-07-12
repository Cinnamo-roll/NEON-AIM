import {
  GRID_SHOT_GRADE_CONFIG,
  GRID_SHOT_GRADE_ORDER,
  type GridShotGrade,
  type GridShotGradeBand,
  type GridShotGradeDimension,
  type GridShotHardGate,
} from "./gridShotGradeConfig";

export interface GridShotGradeInput {
  accuracy: number;
  targetsPerMinute: number;
  consistency: number;
  maxCombo: number;
}

export interface GridShotGradeSubscores {
  accuracy: number;
  speed: number;
  consistency: number;
  control: number;
}

export type GridShotDimensionGrades = Record<GridShotGradeDimension, GridShotGrade>;

export interface GridShotHardGateResult {
  passed: boolean;
  failed: Array<keyof GridShotHardGate>;
  requirements: GridShotHardGate;
}

export interface GridShotGradeResult {
  grade: GridShotGrade;
  rawGrade: GridShotGrade;
  compositeScore: number;
  accuracyCap: GridShotGrade;
  hardGateCap: GridShotGrade;
  subscores: GridShotGradeSubscores;
  subgrades: GridShotDimensionGrades;
  hardGates: Record<"S" | "S+", GridShotHardGateResult>;
  limitedBy: string[];
  explanation: string;
}

const finiteOrZero = (value: number) => Number.isFinite(value) ? value : 0;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, finiteOrZero(value)));
const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const rank = (grade: GridShotGrade) => GRID_SHOT_GRADE_ORDER.indexOf(grade);
const lowerGrade = (...grades: GridShotGrade[]) => grades.reduce((lowest, candidate) => rank(candidate) < rank(lowest) ? candidate : lowest);
const gradeFromBands = (value: number, bands: readonly GridShotGradeBand[]): GridShotGrade =>
  bands.find((band) => value >= band.minimum)?.grade ?? "D";

function evaluateHardGate(input: GridShotGradeInput, requirements: GridShotHardGate): GridShotHardGateResult {
  const failed: Array<keyof GridShotHardGate> = [];
  if (input.accuracy < requirements.accuracy) failed.push("accuracy");
  if (input.targetsPerMinute < requirements.targetsPerMinute) failed.push("targetsPerMinute");
  if (input.consistency < requirements.consistency) failed.push("consistency");
  if (input.maxCombo < requirements.maxCombo) failed.push("maxCombo");
  return { passed: failed.length === 0, failed, requirements: { ...requirements } };
}

function explanationFor(
  input: GridShotGradeInput,
  result: Pick<GridShotGradeResult, "grade" | "rawGrade" | "accuracyCap" | "subgrades" | "hardGates">,
) {
  const accuracyLimited = rank(result.accuracyCap) < rank(result.rawGrade);
  if (
    accuracyLimited
    && input.accuracy >= 70
    && input.accuracy < 80
    && rank(result.subgrades.speed) >= rank("B")
    && result.subgrades.consistency === "D"
    && result.subgrades.control === "D"
  ) {
    return "你的点击速度尚可，但准确率、稳定性和连续命中不足，评级受到准确率上限限制。";
  }
  if (accuracyLimited) {
    return `综合表现达到 ${result.rawGrade}，但当前准确率只允许最高获得 ${result.accuracyCap}。`;
  }
  if (result.grade === "S+" || result.grade === "S") {
    return result.grade === "S+"
      ? "速度、准确率、稳定性和连续控制均达到顶级门槛。"
      : "四项核心能力达到 S 级门槛，整体表现稳定且高效。";
  }
  const failedS = result.hardGates.S.failed;
  if (rank(result.rawGrade) >= rank("S") && failedS.length > 0) {
    const labels: Record<keyof GridShotHardGate, string> = {
      accuracy: "准确率",
      targetsPerMinute: "速度",
      consistency: "稳定性",
      maxCombo: "连续控制",
    };
    return `综合分已进入高等级区间，但${failedS.map((key) => labels[key]).join("、")}未达到 S 级硬门槛。`;
  }
  return "评级由速度、准确率、稳定性和连续控制共同决定；优先改善最低的子项可以提升最终等级。";
}

export function evaluateGridShotGrade(rawInput: GridShotGradeInput): GridShotGradeResult {
  const input: GridShotGradeInput = {
    accuracy: clamp(rawInput.accuracy, 0, 100),
    targetsPerMinute: Math.max(0, finiteOrZero(rawInput.targetsPerMinute)),
    consistency: clamp(rawInput.consistency, 0, 100),
    maxCombo: Math.max(0, finiteOrZero(rawInput.maxCombo)),
  };
  const subscores: GridShotGradeSubscores = {
    accuracy: input.accuracy,
    speed: clamp(input.targetsPerMinute / GRID_SHOT_GRADE_CONFIG.normalization.targetsPerMinuteFor100 * 100, 0, 100),
    consistency: input.consistency,
    control: clamp(input.maxCombo / GRID_SHOT_GRADE_CONFIG.normalization.maxComboFor100 * 100, 0, 100),
  };
  const compositeScore = roundTo(
    subscores.accuracy * GRID_SHOT_GRADE_CONFIG.weights.accuracy
      + subscores.speed * GRID_SHOT_GRADE_CONFIG.weights.speed
      + subscores.consistency * GRID_SHOT_GRADE_CONFIG.weights.consistency
      + subscores.control * GRID_SHOT_GRADE_CONFIG.weights.control,
    2,
  );
  const rawGrade = gradeFromBands(compositeScore, GRID_SHOT_GRADE_CONFIG.overallBands);
  const accuracyCap = gradeFromBands(input.accuracy, GRID_SHOT_GRADE_CONFIG.accuracyCaps);
  const hardGates = {
    S: evaluateHardGate(input, GRID_SHOT_GRADE_CONFIG.hardGates.S),
    "S+": evaluateHardGate(input, GRID_SHOT_GRADE_CONFIG.hardGates["S+"]),
  };
  const hardGateCap: GridShotGrade = !hardGates.S.passed ? "A" : !hardGates["S+"].passed ? "S" : "S+";
  const grade = lowerGrade(rawGrade, accuracyCap, hardGateCap);
  const subgrades: GridShotDimensionGrades = {
    accuracy: gradeFromBands(input.accuracy, GRID_SHOT_GRADE_CONFIG.dimensionBands.accuracy),
    speed: gradeFromBands(input.targetsPerMinute, GRID_SHOT_GRADE_CONFIG.dimensionBands.speed),
    consistency: gradeFromBands(input.consistency, GRID_SHOT_GRADE_CONFIG.dimensionBands.consistency),
    control: gradeFromBands(input.maxCombo, GRID_SHOT_GRADE_CONFIG.dimensionBands.control),
  };
  const limitedBy: string[] = [];
  if (rank(accuracyCap) < rank(rawGrade)) limitedBy.push(`accuracy-cap:${accuracyCap}`);
  if (rank(hardGateCap) < rank(rawGrade)) {
    const gate = hardGates.S.passed ? "S+" : "S";
    limitedBy.push(`hard-gate:${gate}:${hardGates[gate].failed.join(",")}`);
  }
  const partial = { grade, rawGrade, accuracyCap, subgrades, hardGates };
  return {
    ...partial,
    compositeScore,
    hardGateCap,
    subscores: {
      accuracy: roundTo(subscores.accuracy, 2),
      speed: roundTo(subscores.speed, 2),
      consistency: roundTo(subscores.consistency, 2),
      control: roundTo(subscores.control, 2),
    },
    limitedBy,
    explanation: explanationFor(input, partial),
  };
}

export const gradeGridShotPerformance = evaluateGridShotGrade;
