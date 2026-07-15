import { tx } from "../../i18n";
import type {
  TrainingAnalysisFinding,
  TrainingAnalysisNextAction,
  TrainingAnalysisResult,
  TrainingSessionAnalysisSnapshot,
} from "../analysis/trainingAnalysis";
import type { GridShotHistoryRecord } from "../types/training";

export const GRID_SHOT_RULE_ENGINE_VERSION = "grid-shot-rules-v5";

interface PhaseTrend {
  hasEvidence: boolean;
  firstAccuracy: number;
  lastAccuracy: number;
  firstTpm: number;
  lastTpm: number;
  accuracyDelta: number;
  paceDelta: number;
}

type ImprovementFocus = "integrity" | "accuracy" | "rhythm" | "late" | "tradeoff" | "late-pace" | "pace" | "combo";

const round = (value: number) => Math.round(value * 10) / 10;
const percent = (value: number) => `${value.toFixed(1)}%`;

function phaseTrend(snapshot: TrainingSessionAnalysisSnapshot): PhaseTrend {
  const first = snapshot.windows[0];
  const last = snapshot.windows.at(-1);
  if (!first || !last) {
    return { hasEvidence: false, firstAccuracy: 0, lastAccuracy: 0, firstTpm: 0, lastTpm: 0, accuracyDelta: 0, paceDelta: 0 };
  }
  const hasEvidence = first.hits + first.misses >= 3 && last.hits + last.misses >= 3;
  return {
    hasEvidence,
    firstAccuracy: first.accuracy,
    lastAccuracy: last.accuracy,
    firstTpm: first.targetsPerMinute,
    lastTpm: last.targetsPerMinute,
    accuracyDelta: round(last.accuracy - first.accuracy),
    paceDelta: round(last.targetsPerMinute - first.targetsPerMinute),
  };
}

function improvementFocus(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend): ImprovementFocus {
  const summary = snapshot.summary;
  if (!snapshot.integrity.passed) return "integrity";

  const accuracyNeed = summary.accuracy < 85 ? (85 - summary.accuracy) / 25 : 0;
  const rhythmNeed = summary.hits >= 4 && summary.consistencyScore < 70
    ? (70 - summary.consistencyScore) / 70
    : 0;
  const lateNeed = trend.hasEvidence && trend.accuracyDelta <= -5
    ? Math.min(1, Math.abs(trend.accuracyDelta) / 20)
    : 0;
  const tradeoffNeed = lateNeed > 0 && trend.paceDelta >= 10
    ? Math.min(1, lateNeed + trend.paceDelta / 100)
    : 0;
  const latePaceNeed = trend.hasEvidence
    && trend.paceDelta <= -Math.max(10, trend.firstTpm * 0.1)
    && trend.accuracyDelta < 3
    ? Math.min(1, Math.abs(trend.paceDelta) / Math.max(40, trend.firstTpm))
    : 0;
  const needs: Array<[ImprovementFocus, number]> = [
    ["rhythm", rhythmNeed],
    ["accuracy", accuracyNeed],
    ["tradeoff", tradeoffNeed],
    ["late", tradeoffNeed > 0 ? 0 : lateNeed],
    ["late-pace", latePaceNeed],
  ];
  const strongest = needs.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best);
  if (strongest[1] > 0) return strongest[0];
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) return "pace";
  return "combo";
}

function bestObservedPhase(snapshot: TrainingSessionAnalysisSnapshot) {
  return snapshot.windows
    .map((window, index) => ({ window, index }))
    .filter(({ window }) => window.hits + window.misses >= 3)
    .sort((left, right) => right.window.accuracy - left.window.accuracy
      || right.window.targetsPerMinute - left.window.targetsPerMinute)[0];
}

function buildFindings(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend) {
  const summary = snapshot.summary;
  const focus = improvementFocus(snapshot, trend);
  const findings: TrainingAnalysisFinding[] = [];
  if (!snapshot.integrity.passed) {
    findings.push({
      code: "INTEGRITY_REVIEW_REQUIRED",
      severity: "WARNING",
      title: tx("本局数据需要复核", "This session needs a data review"),
      evidence: tx("事件顺序或计分汇总未通过完整性检查。", "The event sequence or score totals did not pass integrity checks."),
      advice: tx("先复核输入和计分完整性，不把本局用于 AI 深度分析或长期趋势基线。", "Review input and scoring integrity before using this session for deep AI analysis or long-term baselines."),
    });
    return findings;
  }
  if (snapshot.integrity.passed && summary.accuracy >= 90 && summary.consistencyScore >= 75) {
    findings.push({
      code: "CONTROL_FOUNDATION",
      severity: "POSITIVE",
      title: tx("准度和节奏都守住了", "Accuracy and rhythm both held up"),
      evidence: tx(`准确率 ${percent(summary.accuracy)}，稳定度 ${summary.consistencyScore.toFixed(0)} 分，最大连击 ${summary.maxCombo}。`, `${percent(summary.accuracy)} accuracy, ${summary.consistencyScore.toFixed(0)} consistency and a ${summary.maxCombo} max combo.`),
      advice: tx("这套点击节奏值得保留，下一局只调整一个小变量。", "Keep this click rhythm and change only one small variable next run."),
    });
  } else if (snapshot.integrity.passed && summary.accuracy >= 90) {
    findings.push({
      code: "ACCURACY_STRENGTH",
      severity: "POSITIVE",
      title: tx("准度是这局最稳定的部分", "Accuracy was the strongest part of this run"),
      evidence: tx(`本局准确率 ${percent(summary.accuracy)}，命中 ${summary.hits} 次、失误 ${summary.misses} 次。`, `${percent(summary.accuracy)} accuracy with ${summary.hits} hits and ${summary.misses} misses.`),
      advice: tx("继续保留点击确认动作，再处理节奏或速度问题。", "Keep the same click confirmation while working on rhythm or pace."),
    });
  } else if (snapshot.integrity.passed && summary.consistencyScore >= 75) {
    findings.push({
      code: "RHYTHM_FOUNDATION",
      severity: "POSITIVE",
      title: tx("点击节奏保持得不错", "Click rhythm held up well"),
      evidence: tx(`稳定度 ${summary.consistencyScore.toFixed(0)} 分，命中速度 ${summary.targetsPerMinute.toFixed(1)} 次/分。`, `${summary.consistencyScore.toFixed(0)} consistency at ${summary.targetsPerMinute.toFixed(1)} hits/min.`),
      advice: tx("保留现在的节奏框架，下一局重点减少失误。", "Keep this rhythm framework and focus on reducing misses next run."),
    });
  } else if (summary.maxCombo >= 8) {
    findings.push({
      code: "COMBO_STRENGTH",
      severity: "POSITIVE",
      title: tx("已经找到连续命中的状态", "A sustained hit streak is already there"),
      evidence: tx(`本局最高连击 ${summary.maxCombo}，共完成 ${summary.hits} 次命中。`, `The run reached a ${summary.maxCombo} max combo across ${summary.hits} hits.`),
      advice: tx("保留连击阶段的视线和点击节奏，再把这种状态维持得更久。", "Keep the visual and click rhythm from the streak and sustain it longer."),
    });
  }
  if (summary.accuracy < 85) {
    findings.push({
      code: "ACCURACY_LIMITS_PACE",
      severity: "OPPORTUNITY",
      title: tx("命中质量正在限制得分", "Accuracy is limiting the score"),
      evidence: tx(
        `共点击 ${summary.hits + summary.misses} 次，命中 ${summary.hits}、失误 ${summary.misses}，本局准确率 ${percent(summary.accuracy)}。`,
        `${summary.hits + summary.misses} clicks produced ${summary.hits} hits and ${summary.misses} misses, for ${percent(summary.accuracy)} accuracy.`,
      ),
      advice: tx("下一局先守住点击确认：准星进入目标轮廓后再开枪，优先减少无效点击。", "Protect click confirmation next run: fire after the crosshair enters the target silhouette and remove wasted shots first."),
    });
  }
  if (trend.hasEvidence && trend.accuracyDelta <= -5) {
    const tradedControlForPace = trend.paceDelta >= 10;
    findings.push({
      code: tradedControlForPace ? "PACE_CONTROL_TRADEOFF" : "LATE_ACCURACY_DROP",
      severity: "OPPORTUNITY",
      title: tradedControlForPace
        ? tx("后段提速换来了控制损失", "Late pace came with a control loss")
        : tx("最后阶段出现明显掉准度", "Accuracy dropped in the final phase"),
      evidence: tradedControlForPace
        ? tx(
          `后段命中速度提高 ${trend.paceDelta.toFixed(1)} 次/分，但准确率下降 ${Math.abs(trend.accuracyDelta).toFixed(1)} 个百分点。`,
          `Late pace rose ${trend.paceDelta.toFixed(1)} hits/min while accuracy fell ${Math.abs(trend.accuracyDelta).toFixed(1)} points.`,
        )
        : tx(
          `第一阶段 ${percent(trend.firstAccuracy)}，最后阶段 ${percent(trend.lastAccuracy)}，下降 ${Math.abs(trend.accuracyDelta).toFixed(1)} 个百分点。`,
          `Accuracy moved from ${percent(trend.firstAccuracy)} early to ${percent(trend.lastAccuracy)} late, a ${Math.abs(trend.accuracyDelta).toFixed(1)} point drop.`,
        ),
      advice: tradedControlForPace
        ? tx("末段不要继续抢节奏，先用中段速度守住点击确认。", "Use the middle-phase pace late instead of forcing more speed, and keep click confirmation.")
        : tx("最后三分之一沿用中段节奏，每次看准后再点。", "Reuse the middle-phase rhythm in the final third and confirm each target before clicking."),
    });
  }
  if (summary.hits >= 4 && summary.consistencyScore < 70) {
    const medianInterval = summary.medianHitInterval ?? summary.averageHitInterval;
    findings.push({
      code: "RHYTHM_INSTABILITY",
      severity: "OPPORTUNITY",
      title: tx("相邻两次命中的间隔不够稳定", "The gap between hits is inconsistent"),
      evidence: tx(
        `平均命中间隔 ${summary.averageHitInterval.toFixed(0)}ms、中位数 ${medianInterval.toFixed(0)}ms，稳定度 ${summary.consistencyScore.toFixed(0)} / 100。`,
        `${summary.averageHitInterval.toFixed(0)}ms average and ${medianInterval.toFixed(0)}ms median hit intervals, with ${summary.consistencyScore.toFixed(0)} / 100 consistency.`,
      ),
      advice: tx("连续五次命中保持相近的移动和停枪节奏，先消除忽快忽慢。", "Keep a similar move-and-stop rhythm for five hits and remove fast-slow swings first."),
    });
  }
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) {
    const medianInterval = summary.medianHitInterval ?? summary.averageHitInterval;
    findings.push({
      code: "PACE_OPPORTUNITY",
      severity: "OPPORTUNITY",
      title: tx("稳定基础上还可以小幅提速", "There is room to add pace on a stable base"),
      evidence: tx(
        `准确率 ${percent(summary.accuracy)}，命中间隔平均 ${summary.averageHitInterval.toFixed(0)}ms、中位数 ${medianInterval.toFixed(0)}ms。`,
        `${percent(summary.accuracy)} accuracy with ${summary.averageHitInterval.toFixed(0)}ms average and ${medianInterval.toFixed(0)}ms median hit intervals.`,
      ),
      advice: tx("保持点击确认不变，每次切换只提前约 30ms，逐步压缩空档。", "Keep the same click confirmation and trim only about 30ms from each transition."),
    });
  }
  if (trend.hasEvidence && trend.accuracyDelta >= 5 && trend.lastAccuracy >= summary.accuracy
    && trend.lastTpm >= trend.firstTpm) {
    findings.push({
      code: "STRONG_FINISH",
      severity: "POSITIVE",
      title: tx("最后阶段比开局更稳", "The final phase was steadier than the opening"),
      evidence: tx(`后程准确率提升 ${trend.accuracyDelta.toFixed(1)} 个百分点，同时节奏没有下降。`, `Late accuracy improved by ${trend.accuracyDelta.toFixed(1)} points without losing pace.`),
      advice: tx("复用最后阶段的视线和点击节奏，让这种状态更早出现。", "Reuse the visual and click rhythm from the final phase earlier in the next run."),
    });
  }
  if (
    trend.hasEvidence
    && trend.paceDelta <= -Math.max(10, trend.firstTpm * 0.1)
    && trend.accuracyDelta > -5
    && trend.accuracyDelta < 3
  ) {
    findings.push({
      code: "LATE_PACE_DROP",
      severity: "OPPORTUNITY",
      title: tx("后段命中速度出现回落", "Hit pace fell in the final phase"),
      evidence: tx(
        `命中速度从前段 ${trend.firstTpm.toFixed(1)} 降到后段 ${trend.lastTpm.toFixed(1)} 次/分，准确率没有同步提升。`,
        `Hit pace fell from ${trend.firstTpm.toFixed(1)} to ${trend.lastTpm.toFixed(1)} per minute without an accuracy gain.`,
      ),
      advice: tx("最后三分之一保持前段的观察与点击节拍，不靠停顿换准确率。", "Keep the early scan-and-click cadence in the final third instead of adding pauses."),
    });
  }
  if (!findings.some((finding) => finding.severity === "POSITIVE")) {
    const best = bestObservedPhase(snapshot);
    if (best) {
      findings.push({
        code: "BEST_PHASE_CONTROL",
        severity: "POSITIVE",
        title: tx(`第 ${best.index + 1} 阶段最值得复用`, `Phase ${best.index + 1} is the best reference`),
        evidence: tx(
          `该阶段准确率 ${percent(best.window.accuracy)}，命中速度 ${best.window.targetsPerMinute.toFixed(1)} 次/分。`,
          `${percent(best.window.accuracy)} accuracy at ${best.window.targetsPerMinute.toFixed(1)} hits/min in that phase.`,
        ),
        advice: tx("下一局从开局就复用这一阶段的观察与点击节拍。", "Reuse that phase's scan-and-click cadence from the start of the next run."),
      });
    }
  }
  if (findings.length === 0) {
    findings.push({
      code: "BASELINE_ESTABLISHED",
      severity: "POSITIVE",
      title: tx("已建立第一份有效基线", "A valid baseline is now established"),
      evidence: tx(`本局记录了 ${summary.hits} 次命中和 ${summary.misses} 次失误。`, `This session recorded ${summary.hits} hits and ${summary.misses} misses.`),
      advice: tx("再完成两到三局同配置训练，系统就能更可靠地判断趋势。", "Complete two or three more runs with the same setup for a more reliable trend."),
    });
  }
  const focusCode: Partial<Record<ImprovementFocus, string>> = {
    accuracy: "ACCURACY_LIMITS_PACE",
    rhythm: "RHYTHM_INSTABILITY",
    late: "LATE_ACCURACY_DROP",
    tradeoff: "PACE_CONTROL_TRADEOFF",
    "late-pace": "LATE_PACE_DROP",
    pace: "PACE_OPPORTUNITY",
  };
  const strengths = findings.filter((finding) => finding.severity === "POSITIVE");
  const opportunities = findings
    .filter((finding) => finding.severity === "OPPORTUNITY")
    .sort((left, right) => Number(right.code === focusCode[focus]) - Number(left.code === focusCode[focus]));
  return [...strengths.slice(0, 1), ...opportunities, ...strengths.slice(1)].slice(0, 3);
}

function buildHeadline(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend) {
  const summary = snapshot.summary;
  const focus = improvementFocus(snapshot, trend);
  if (!snapshot.integrity.passed) return tx("先复核数据，再判断训练表现", "Review the data before judging performance");
  if (focus === "rhythm" && summary.maxCombo >= 8) return tx("连击已经出现，先把命中节奏稳定下来", "The streak is there; now steady the hit rhythm");
  if (focus === "rhythm") return tx("命中节奏的波动是这局主要问题", "Hit-rhythm variation was the main issue");
  if (focus === "accuracy" && summary.maxCombo >= 8) return tx("连击已经打出来，但失误正在限制得分", "The streak is there, but misses are limiting the score");
  if (focus === "accuracy") return tx("无效点击正在拉低这局得分", "Wasted clicks are pulling down the score");
  if (focus === "tradeoff") return tx("后段提速了，但点击控制没有跟上", "Late pace increased, but click control did not hold");
  if (focus === "late") return tx("最后阶段没有守住前面的状态", "The final phase did not hold the earlier form");
  if (focus === "late-pace") return tx("后段节奏放慢，是这局最明显的变化", "The clearest change was a late-session pace drop");
  if (focus === "pace") return tx("控制已经稳定，可以开始压缩空档", "Control is stable; transition gaps can now shrink");
  if (summary.accuracy >= 90 && summary.consistencyScore >= 75) return tx("这局准度和节奏都很稳", "Accuracy and rhythm were both strong");
  if (trend.hasEvidence && trend.accuracyDelta >= 5) return tx("最后阶段比开局更加稳定", "The finish was steadier than the opening");
  return tx("这局整体控制比较稳定", "Overall control was stable");
}

function buildOverview(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend) {
  const summary = snapshot.summary;
  const focus = improvementFocus(snapshot, trend);
  let strength = "";
  if (snapshot.integrity.passed && summary.accuracy >= 90 && summary.consistencyScore >= 75) strength = tx("这局最值得保留的是准度和节奏都守住了。", "The key strength was holding both accuracy and rhythm. ");
  else if (snapshot.integrity.passed && summary.accuracy >= 90) strength = tx("这局的准度值得肯定。", "Accuracy was a clear strength in this run. ");
  else if (snapshot.integrity.passed && summary.consistencyScore >= 75) strength = tx("这局的点击节奏保持得不错。", "Click rhythm held up well in this run. ");
  else if (snapshot.integrity.passed && summary.maxCombo >= 10) strength = tx(`这局已经打出 ${summary.maxCombo} 连击，连续命中的状态是有的。`, `The ${summary.maxCombo} max combo shows a solid streak was already there. `);
  else if (snapshot.integrity.passed) {
    const best = bestObservedPhase(snapshot);
    if (best) strength = tx(
      `第 ${best.index + 1} 阶段是本局最可复用的区间：准确率 ${percent(best.window.accuracy)}，命中速度 ${best.window.targetsPerMinute.toFixed(1)} 次/分。`,
      `Phase ${best.index + 1} was the best reference at ${percent(best.window.accuracy)} accuracy and ${best.window.targetsPerMinute.toFixed(1)} hits/min. `,
    );
  }
  const metrics = tx(
    `本局 ${summary.hits} 次命中、${summary.misses} 次失误，准确率 ${percent(summary.accuracy)}，命中速度 ${summary.targetsPerMinute.toFixed(1)} 次/分，稳定度 ${summary.consistencyScore.toFixed(0)} 分。`,
    `${summary.hits} hits and ${summary.misses} misses at ${percent(summary.accuracy)}, ${summary.targetsPerMinute.toFixed(1)} hits/min and ${summary.consistencyScore.toFixed(0)} consistency. `,
  );
  let ending: string;
  if (!snapshot.integrity.passed) ending = tx("本局暂不进入长期趋势判断。", "This run is excluded from long-term trends for now.");
  else if (focus === "rhythm") ending = tx("这局更需要处理的是命中间隔波动，而不是继续追求瞬时速度。", "Uneven hit intervals matter more here than chasing another burst of speed.");
  else if (focus === "accuracy") ending = tx("当前得分损失主要来自无效点击，下一局适合先减少失误。", "Wasted clicks caused most of the score loss, so the next run should reduce misses first.");
  else if (focus === "tradeoff") ending = tx("后段速度提高了，但准确率同步下降；问题不是速度不够，而是提速后没有守住点击确认。", "Late pace rose while accuracy fell; the issue is preserving click confirmation at that pace.");
  else if (focus === "late") ending = tx("前面打得不错，但最后阶段拉低了这一局的整体表现。", "The early phases were solid, but the final phase pulled down the overall result.");
  else if (focus === "late-pace") ending = tx("后段命中速度回落且没有换来更高准确率，下一局应优先维持前段节拍。", "Late pace fell without an accuracy gain, so the next run should preserve the early cadence.");
  else if (focus === "pace") ending = tx("控制基础已经够用，下一步可以小幅缩短目标切换空档。", "The control base is ready for slightly shorter transition gaps.");
  else ending = tx("目前没有明显短板，准度、速度和稳定性处在同一水平。", "There is no major weakness; accuracy, pace, and consistency are balanced.");
  return `${strength}${metrics}${ending}`;
}

function buildNextAction(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend): TrainingAnalysisNextAction {
  const summary = snapshot.summary;
  const focus = improvementFocus(snapshot, trend);
  if (!snapshot.integrity.passed) {
    return {
      title: tx("完成一局有效基线", "Complete a valid baseline run"),
      description: tx("保持当前配置重新训练，确保事件和计分完整。", "Repeat the same setup and keep the event and score record complete."),
      targets: [{ metric: "integrity", label: tx("数据完整", "Data integrity"), operator: "AT_LEAST", value: 1, unit: tx("通过", "pass") }],
    };
  }
  if (focus === "rhythm") {
    return {
      title: tx("先把点击间隔打匀", "Even out the click intervals"),
      description: tx("先不追求更快，连续几次命中保持相近的切换和停枪节奏。", "Do not chase more speed yet; keep several transitions and stops at a similar rhythm."),
      targets: [{ metric: "consistencyScore", label: tx("稳定度", "Consistency"), operator: "AT_LEAST", value: round(Math.min(75, summary.consistencyScore + 10)), unit: tx("分", "pts") }],
    };
  }
  if (focus === "accuracy") {
    return {
      title: tx("先把无效点击压下来", "Cut down wasted clicks first"),
      description: tx("保持现在的命中速度，每次点击前多留一次确认，先让本局准确率小幅提高。", "Keep the current hit pace and add one confirmation before each click for a small accuracy gain."),
      targets: [{ metric: "accuracy", label: tx("准确率", "Accuracy"), operator: "AT_LEAST", value: round(Math.min(90, summary.accuracy + 5)), unit: "%" }],
    };
  }
  if (focus === "late" || focus === "tradeoff") {
    const lateTarget = trend.lastAccuracy + Math.min(5, Math.max(2, Math.abs(trend.accuracyDelta) / 2));
    return {
      title: focus === "tradeoff"
        ? tx("提速时守住点击确认", "Keep click control while adding pace")
        : tx("把前段状态带到最后", "Carry the early form into the finish"),
      description: focus === "tradeoff"
        ? tx("末段先回到中段速度，确认准确率稳定后再逐步加速。", "Return to the middle-phase pace late, then add speed only after accuracy holds.")
        : tx("最后三分之一沿用中段节奏，不额外抢速度。", "Reuse the middle-phase rhythm in the final third without forcing extra speed."),
      targets: [{ metric: "lastPhaseAccuracy", label: tx("后程准确率", "Late accuracy"), operator: "AT_LEAST", value: round(Math.min(95, lateTarget)), unit: "%" }],
    };
  }
  if (focus === "late-pace") {
    return {
      title: tx("把前段节拍保持到结束", "Hold the early cadence through the finish"),
      description: tx("保持点击确认不变，重点减少后段额外停顿。", "Keep click confirmation unchanged and remove extra late-session pauses."),
      targets: [{ metric: "targetsPerMinute", label: tx("命中速度", "Hit pace"), operator: "AT_LEAST", value: round(summary.targetsPerMinute + 5), unit: tx("次/分", "hits/min") }],
    };
  }
  if (focus === "pace") {
    return {
      title: tx("准确率不掉，小幅提速", "Add a little pace without losing accuracy"),
      description: tx("每次切换提前约 30ms，不改变点击确认动作。", "Trim about 30ms from each transition without changing click confirmation."),
      targets: [{ metric: "averageHitInterval", label: tx("平均命中间隔", "Average hit interval"), operator: "AT_MOST", value: Math.max(280, Math.round(summary.averageHitInterval - 30)), unit: "ms" }],
    };
  }
  return {
    title: tx("把高质量连击拉长", "Extend the high-quality combo window"),
    description: tx("保持现在的整体控制，争取把连续命中的状态多延长几次。", "Keep the current overall control and extend the sustained hit streak by a few shots."),
    targets: [{ metric: "maxCombo", label: tx("最高连击", "Max combo"), operator: "AT_LEAST", value: summary.maxCombo + 3, unit: tx("次", "hits") }],
  };
}

export function buildGridShotRuleAnalysis(snapshot: TrainingSessionAnalysisSnapshot): TrainingAnalysisResult {
  const trend = phaseTrend(snapshot);
  return {
    schemaVersion: 1,
    status: "READY",
    source: "RULES",
    engineVersion: GRID_SHOT_RULE_ENGINE_VERSION,
    providerId: null,
    model: null,
    promptVersion: null,
    headline: buildHeadline(snapshot, trend),
    summary: buildOverview(snapshot, trend),
    findings: buildFindings(snapshot, trend),
    nextAction: buildNextAction(snapshot, trend),
    usage: { inputTokens: 0, outputTokens: 0 },
    generatedAt: snapshot.source.completedAt,
  };
}

/** Backward-compatible one-line coach copy for older consumers. */
export function trainingAdvice(record: GridShotHistoryRecord) {
  const accuracyNeed = record.accuracy < 85 ? (85 - record.accuracy) / 25 : 0;
  const rhythmNeed = (record.consistencyScore || 0) < 70 ? (70 - (record.consistencyScore || 0)) / 70 : 0;
  if (rhythmNeed > accuracyNeed) return tx("命中间隔波动更明显，下一局先把连续点击的节奏打匀。", "Hit intervals vary more; even out the click rhythm next run.");
  if (record.accuracy < 85) return tx(`本局准确率 ${record.accuracy.toFixed(1)}%，下一局先减少无效点击。`, `Accuracy was ${record.accuracy.toFixed(1)}%; reduce wasted clicks next run.`);
  if ((record.averageHitInterval || 0) > 400) return tx("准度稳定，下一局可以小幅压缩切换间隔。", "Accuracy is stable; trim the transition interval slightly next run.");
  if ((record.consistencyScore || 0) < 70) return tx("节奏波动偏大，下一局先建立连续五次等节奏命中。", "Rhythm is uneven; build five even-rhythm hits next run.");
  return tx("本局控制稳定，下一局延长高质量连击区间。", "Control was stable; extend the high-quality combo window next run.");
}
