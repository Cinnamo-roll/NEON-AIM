import { tx } from "../../i18n";
import type {
  TrainingAnalysisFinding,
  TrainingAnalysisNextAction,
  TrainingAnalysisResult,
  TrainingSessionAnalysisSnapshot,
} from "../analysis/trainingAnalysis";
import type { GridShotHistoryRecord } from "../types/training";

export const GRID_SHOT_RULE_ENGINE_VERSION = "grid-shot-rules-v2";

interface PhaseTrend {
  hasEvidence: boolean;
  firstAccuracy: number;
  lastAccuracy: number;
  firstTpm: number;
  lastTpm: number;
  accuracyDelta: number;
}

const round = (value: number) => Math.round(value * 10) / 10;
const percent = (value: number) => `${value.toFixed(1)}%`;

function phaseTrend(snapshot: TrainingSessionAnalysisSnapshot): PhaseTrend {
  const first = snapshot.windows[0];
  const last = snapshot.windows.at(-1);
  if (!first || !last) {
    return { hasEvidence: false, firstAccuracy: 0, lastAccuracy: 0, firstTpm: 0, lastTpm: 0, accuracyDelta: 0 };
  }
  const hasEvidence = first.hits + first.misses >= 3 && last.hits + last.misses >= 3;
  return {
    hasEvidence,
    firstAccuracy: first.accuracy,
    lastAccuracy: last.accuracy,
    firstTpm: first.targetsPerMinute,
    lastTpm: last.targetsPerMinute,
    accuracyDelta: round(last.accuracy - first.accuracy),
  };
}

function buildFindings(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend) {
  const summary = snapshot.summary;
  const findings: TrainingAnalysisFinding[] = [];
  if (!snapshot.integrity.passed) {
    findings.push({
      code: "INTEGRITY_REVIEW_REQUIRED",
      severity: "WARNING",
      title: tx("本局数据需要复核", "This session needs a data review"),
      evidence: tx("事件顺序或计分汇总未通过完整性检查。", "The event sequence or score totals did not pass integrity checks."),
      advice: tx("先保留记录，不把本局用于 AI 深度分析或长期趋势基线。", "Keep the record, but exclude it from deep AI analysis and long-term baselines."),
    });
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
  } else if (snapshot.integrity.passed && summary.maxCombo >= 10) {
    findings.push({
      code: "COMBO_STRENGTH",
      severity: "POSITIVE",
      title: tx("已经打出一段连续命中", "A solid hit streak is already there"),
      evidence: tx(`本局最高连击 ${summary.maxCombo}，共命中 ${summary.hits} 次。`, `The run reached a ${summary.maxCombo} max combo with ${summary.hits} hits.`),
      advice: tx("保留这段连击时的视线和点击节奏，争取更早进入状态。", "Reuse the visual and click rhythm from that streak earlier in the next run."),
    });
  }
  if (summary.accuracy < 85) {
    findings.push({
      code: "ACCURACY_LIMITS_PACE",
      severity: "OPPORTUNITY",
      title: tx("命中质量正在限制得分", "Accuracy is limiting the score"),
      evidence: tx(
        `共点击 ${summary.hits + summary.misses} 次，命中 ${summary.hits}、失误 ${summary.misses}；准确率 ${percent(summary.accuracy)}，距离 90% 目标还差 ${(90 - summary.accuracy).toFixed(1)} 个百分点。`,
        `${summary.hits + summary.misses} clicks produced ${summary.hits} hits and ${summary.misses} misses. Accuracy is ${percent(summary.accuracy)}, ${(90 - summary.accuracy).toFixed(1)} points short of the 90% target.`,
      ),
      advice: tx("下一局先守住点击确认：准星进入目标轮廓后再开枪，优先减少无效点击。", "Protect click confirmation next run: fire after the crosshair enters the target silhouette and remove wasted shots first."),
    });
  }
  if (trend.hasEvidence && trend.accuracyDelta <= -5) {
    findings.push({
      code: "LATE_ACCURACY_DROP",
      severity: "OPPORTUNITY",
      title: tx("最后阶段出现明显掉准度", "Accuracy dropped in the final phase"),
      evidence: tx(
        `第一阶段 ${percent(trend.firstAccuracy)}，最后阶段 ${percent(trend.lastAccuracy)}，下降 ${Math.abs(trend.accuracyDelta).toFixed(1)} 个百分点。`,
        `Accuracy moved from ${percent(trend.firstAccuracy)} early to ${percent(trend.lastAccuracy)} late, a ${Math.abs(trend.accuracyDelta).toFixed(1)} point drop.`,
      ),
      advice: tx("最后三分之一沿用中段节奏，每次看准后再点。", "Reuse the middle-phase rhythm in the final third and confirm each target before clicking."),
    });
  }
  if (summary.hits >= 4 && summary.consistencyScore < 70) {
    findings.push({
      code: "RHYTHM_INSTABILITY",
      severity: "OPPORTUNITY",
      title: tx("相邻两次命中的间隔不够稳定", "The gap between hits is inconsistent"),
      evidence: tx(`稳定度为 ${summary.consistencyScore.toFixed(0)} / 100，建议先提升到 75 以上。`, `Rhythm stability is ${summary.consistencyScore.toFixed(0)} / 100, below the 75-point target.`),
      advice: tx("连续五次命中保持相近的移动和停枪节奏，先消除忽快忽慢。", "Keep a similar move-and-stop rhythm for five hits and remove fast-slow swings first."),
    });
  }
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) {
    findings.push({
      code: "PACE_OPPORTUNITY",
      severity: "POSITIVE",
      title: tx("准确率已经稳定，可以小幅提速", "Accuracy is stable enough for a small pace increase"),
      evidence: tx(`准确率 ${percent(summary.accuracy)}，平均命中间隔 ${summary.averageHitInterval.toFixed(0)}ms。`, `${percent(summary.accuracy)} accuracy with a ${summary.averageHitInterval.toFixed(0)}ms average hit interval.`),
      advice: tx("保持点击确认不变，每次切换只提前约 30ms，逐步压缩空档。", "Keep the same click confirmation and trim only about 30ms from each transition."),
    });
  }
  if (trend.hasEvidence && trend.accuracyDelta >= 5 && trend.lastTpm >= trend.firstTpm) {
    findings.push({
      code: "STRONG_FINISH",
      severity: "POSITIVE",
      title: tx("最后阶段比开局更稳", "The final phase was steadier than the opening"),
      evidence: tx(`后程准确率提升 ${trend.accuracyDelta.toFixed(1)} 个百分点，同时节奏没有下降。`, `Late accuracy improved by ${trend.accuracyDelta.toFixed(1)} points without losing pace.`),
      advice: tx("复用最后阶段的视线和点击节奏，让这种状态更早出现。", "Reuse the visual and click rhythm from the final phase earlier in the next run."),
    });
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
  return findings.slice(0, 3);
}

function buildHeadline(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend) {
  const summary = snapshot.summary;
  if (!snapshot.integrity.passed) return tx("先复核数据，再判断训练表现", "Review the data before judging performance");
  if (summary.accuracy >= 90 && summary.consistencyScore >= 75) {
    if (trend.hasEvidence && trend.accuracyDelta <= -5) return tx("整体打得很稳，后程再守住一点会更完整", "Overall control was strong; hold it a little longer late");
    if (summary.averageHitInterval > 400) return tx("准度和节奏都守住了，可以从容地再快一点", "Accuracy and rhythm held up; add pace gradually");
    return tx("这局准度和节奏都很稳，值得保持", "Accuracy and rhythm were both strong; keep this form");
  }
  if (summary.accuracy < 85 && summary.consistencyScore >= 75) return tx("节奏保持得不错，下一步把准度补上", "Rhythm held up well; bring accuracy up next");
  if (summary.accuracy < 85 && summary.maxCombo >= 10) return tx("连击已经打出来了，下一步减少失误", "The streak is there; reduce misses next");
  if (summary.accuracy < 85) return tx("失误有点多，下一局先把准度拉回来", "There were too many misses; recover accuracy next run");
  if (trend.hasEvidence && trend.accuracyDelta <= -5) return tx("最后阶段掉准度，先解决后程稳定性", "Accuracy dropped late; stabilize the final phase first");
  if (summary.accuracy >= 90 && summary.hits >= 4 && summary.consistencyScore < 70) return tx("准度已经很好，再把命中节奏稳住", "Accuracy is already strong; steady the hit rhythm next");
  if (summary.hits >= 4 && summary.consistencyScore < 70) return tx("速度不慢，但命中节奏忽快忽慢", "Pace is fine, but the hit rhythm swings too much");
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) return tx("准确率已经够稳，可以开始小幅提速", "Accuracy is stable enough for a small pace increase");
  if (trend.hasEvidence && trend.accuracyDelta >= 5) return tx("最后阶段更稳，把这个节奏提前复制", "The finish was steadier; reproduce that rhythm earlier");
  return tx("整体表现稳定，下一步把高质量连击拉长", "Overall control is stable; extend the high-quality combo window");
}

function buildOverview(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend) {
  const summary = snapshot.summary;
  let strength = "";
  if (snapshot.integrity.passed && summary.accuracy >= 90 && summary.consistencyScore >= 75) strength = tx("这局最值得保留的是准度和节奏都守住了。", "The key strength was holding both accuracy and rhythm. ");
  else if (snapshot.integrity.passed && summary.accuracy >= 90) strength = tx("这局的准度值得肯定。", "Accuracy was a clear strength in this run. ");
  else if (snapshot.integrity.passed && summary.consistencyScore >= 75) strength = tx("这局的点击节奏保持得不错。", "Click rhythm held up well in this run. ");
  else if (snapshot.integrity.passed && summary.maxCombo >= 10) strength = tx(`这局已经打出 ${summary.maxCombo} 连击，连续命中的状态是有的。`, `The ${summary.maxCombo} max combo shows a solid streak was already there. `);
  const metrics = tx(
    `本局 ${summary.hits} 次命中、${summary.misses} 次失误，准确率 ${percent(summary.accuracy)}，命中速度 ${summary.targetsPerMinute.toFixed(1)} 次/分，稳定度 ${summary.consistencyScore.toFixed(0)} 分。`,
    `${summary.hits} hits and ${summary.misses} misses at ${percent(summary.accuracy)}, ${summary.targetsPerMinute.toFixed(1)} hits/min and ${summary.consistencyScore.toFixed(0)} consistency. `,
  );
  let ending: string;
  if (!snapshot.integrity.passed) ending = tx("本局暂不进入长期趋势判断。", "This run is excluded from long-term trends for now.");
  else if (summary.accuracy < 85 && summary.consistencyScore >= 75) ending = tx("保留这份节奏，下一局只把注意力放在减少失误上。", "Keep this rhythm and focus only on reducing misses next run.");
  else if (summary.accuracy < 85) ending = tx("下一局先把失误压下来，速度保持在现在这个水平就够了。", "Reduce misses next run and keep the current pace for now.");
  else if (trend.hasEvidence && trend.accuracyDelta <= -5) ending = tx("前面打得不错，但最后阶段拉低了这一局的整体表现。", "The early phases were solid, but the final phase pulled down the overall result.");
  else if (summary.consistencyScore < 70) ending = tx("速度没有问题，主要是点击节奏还不够均匀。", "Pace is fine; the main issue is uneven click rhythm.");
  else ending = tx("目前没有明显短板，下一局可以在保持准度的前提下稍微快一点。", "There is no major weakness; next run can be slightly faster while keeping the same accuracy.");
  return `${strength}${metrics}${ending}`;
}

function buildNextAction(snapshot: TrainingSessionAnalysisSnapshot, trend: PhaseTrend): TrainingAnalysisNextAction {
  const summary = snapshot.summary;
  if (!snapshot.integrity.passed) {
    return {
      title: tx("完成一局有效基线", "Complete a valid baseline run"),
      description: tx("保持当前配置重新训练，确保事件和计分完整。", "Repeat the same setup and keep the event and score record complete."),
      targets: [{ metric: "integrity", label: tx("数据完整", "Data integrity"), operator: "AT_LEAST", value: 1, unit: tx("通过", "pass") }],
    };
  }
  if (summary.accuracy < 85) {
    return {
      title: tx("下一局先把准确率做到 90%", "Reach 90% accuracy next run"),
      description: tx("可以暂时慢一点，但每次点击都要确认准星已经进入目标。", "A slower pace is fine; confirm the crosshair is on target before every click."),
      targets: [
        { metric: "accuracy", label: tx("准确率", "Accuracy"), operator: "AT_LEAST", value: 90, unit: "%" },
        { metric: "consistencyScore", label: tx("稳定度", "Consistency"), operator: "AT_LEAST", value: 70, unit: tx("分", "pts") },
      ],
    };
  }
  if (trend.hasEvidence && trend.accuracyDelta <= -5) {
    return {
      title: tx("保持后程准确率", "Hold late-session accuracy"),
      description: tx("前两段保持当前速度，最后阶段不要额外抢节奏。", "Keep the current pace early and avoid forcing extra speed late."),
      targets: [
        { metric: "lastPhaseAccuracy", label: tx("后程准确率", "Late accuracy"), operator: "AT_LEAST", value: round(Math.min(95, Math.max(85, trend.firstAccuracy - 2))), unit: "%" },
        { metric: "consistencyScore", label: tx("稳定度", "Consistency"), operator: "AT_LEAST", value: 75, unit: tx("分", "pts") },
      ],
    };
  }
  if (summary.hits >= 4 && summary.consistencyScore < 70) {
    return {
      title: tx("连续五次稳定命中", "Build five stable hits"),
      description: tx("下一局先把每次切换的节奏做得更均匀。", "Make each transition more even next run."),
      targets: [
        { metric: "consistencyScore", label: tx("稳定度", "Consistency"), operator: "AT_LEAST", value: 75, unit: tx("分", "pts") },
        { metric: "accuracy", label: tx("准确率", "Accuracy"), operator: "AT_LEAST", value: Math.max(85, round(summary.accuracy)), unit: "%" },
      ],
    };
  }
  if (summary.accuracy >= 90 && summary.averageHitInterval > 400) {
    return {
      title: tx("准确率不掉，小幅提速", "Add a little pace without losing accuracy"),
      description: tx("每次切换提前约 30ms，不改变点击确认动作。", "Trim about 30ms from each transition without changing click confirmation."),
      targets: [
        { metric: "averageHitInterval", label: tx("平均命中间隔", "Average hit interval"), operator: "AT_MOST", value: Math.max(280, Math.round(summary.averageHitInterval - 30)), unit: "ms" },
        { metric: "accuracy", label: tx("准确率", "Accuracy"), operator: "AT_LEAST", value: 90, unit: "%" },
      ],
    };
  }
  return {
    title: tx("把高质量连击拉长", "Extend the high-quality combo window"),
    description: tx("维持当前准度，把稳定节奏保持到更长的 Combo。", "Hold the current accuracy and keep the rhythm through a longer combo."),
    targets: [
      { metric: "accuracy", label: tx("准确率", "Accuracy"), operator: "AT_LEAST", value: Math.max(90, round(summary.accuracy)), unit: "%" },
      { metric: "targetsPerMinute", label: tx("命中速度", "Hit pace"), operator: "AT_LEAST", value: round(summary.targetsPerMinute + 3), unit: "TPM" },
    ],
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
  if (record.accuracy < 85) return tx(`你的准确率只有 ${record.accuracy.toFixed(1)}%，下一局先稳定到 90%。`, `Accuracy is ${record.accuracy.toFixed(1)}%; stabilize at 90% next run.`);
  if ((record.averageHitInterval || 0) > 400) return tx("准度稳定，下一局可以小幅压缩切换间隔。", "Accuracy is stable; trim the transition interval slightly next run.");
  if ((record.consistencyScore || 0) < 70) return tx("节奏波动偏大，下一局先建立连续五次等节奏命中。", "Rhythm is uneven; build five even-rhythm hits next run.");
  return tx("本局控制稳定，下一局延长高质量连击区间。", "Control was stable; extend the high-quality combo window next run.");
}
