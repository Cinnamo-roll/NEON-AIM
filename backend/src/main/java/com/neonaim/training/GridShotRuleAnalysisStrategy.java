package com.neonaim.training;

import com.neonaim.training.api.TrainingAnalysisResult;
import com.neonaim.training.api.TrainingAnalysisResult.Finding;
import com.neonaim.training.api.TrainingAnalysisResult.NextAction;
import com.neonaim.training.api.TrainingAnalysisResult.Operator;
import com.neonaim.training.api.TrainingAnalysisResult.Severity;
import com.neonaim.training.api.TrainingAnalysisResult.Target;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
class GridShotRuleAnalysisStrategy implements TrainingRuleAnalysisStrategy {

	static final String TRAINING_ID = "grid-shot";
	static final String ENGINE_VERSION = "grid-shot-rules-v3";

	private enum Focus { INTEGRITY, ACCURACY, RHYTHM, LATE, TRADEOFF, LATE_PACE, PACE, COMBO }

	@Override
	public String trainingId() {
		return TRAINING_ID;
	}

	@Override
	public TrainingAnalysisResult analyze(TrainingRuleAnalysisContext context, Instant generatedAt) {
		TrainingSessionSubmission.Summary summary = context.summary();
		PhaseTrend phaseTrend = phaseTrend(context.snapshot());
		List<Finding> findings = findings(summary, phaseTrend, context.integrityPassed(), context.snapshot());
		String headline = headline(summary, phaseTrend, context.integrityPassed());
		String overview = format("本局完成 %d 次命中，准确率 %.1f%%，节奏 %.1f TPM，稳定性 %.0f 分。%s",
				summary.hits(), summary.accuracy(), summary.targetsPerMinute(), summary.consistencyScore(),
				overviewEnding(summary, phaseTrend, context.integrityPassed()));
		return TrainingAnalysisResult.rules(ENGINE_VERSION, headline, overview, findings,
				nextAction(summary, phaseTrend, context.integrityPassed()), generatedAt);
	}

	private static Focus focus(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) return Focus.INTEGRITY;
		double accuracyNeed = summary.accuracy() < 85 ? (85 - summary.accuracy()) / 25 : 0;
		double rhythmNeed = summary.hits() >= 4 && summary.consistencyScore() < 70
				? (70 - summary.consistencyScore()) / 70 : 0;
		double lateNeed = trend.hasEvidence() && trend.accuracyDelta() <= -5
				? Math.min(1, Math.abs(trend.accuracyDelta()) / 20) : 0;
		double tradeoffNeed = lateNeed > 0 && trend.paceDelta() >= 10
				? Math.min(1, lateNeed + trend.paceDelta() / 100) : 0;
		double latePaceNeed = trend.hasEvidence()
				&& trend.paceDelta() <= -Math.max(10, trend.firstTpm() * 0.1)
				&& trend.accuracyDelta() > -5 && trend.accuracyDelta() < 3
				? Math.min(1, Math.abs(trend.paceDelta()) / Math.max(40, trend.firstTpm())) : 0;
		Focus strongest = Focus.RHYTHM;
		double strongestNeed = rhythmNeed;
		if (accuracyNeed > strongestNeed) { strongest = Focus.ACCURACY; strongestNeed = accuracyNeed; }
		if (tradeoffNeed > strongestNeed) { strongest = Focus.TRADEOFF; strongestNeed = tradeoffNeed; }
		if (tradeoffNeed == 0 && lateNeed > strongestNeed) { strongest = Focus.LATE; strongestNeed = lateNeed; }
		if (latePaceNeed > strongestNeed) { strongest = Focus.LATE_PACE; strongestNeed = latePaceNeed; }
		if (strongestNeed > 0) return strongest;
		if (summary.accuracy() >= 90 && summary.averageHitInterval() > 400) return Focus.PACE;
		return Focus.COMBO;
	}

	private static List<Finding> findings(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed, JsonNode snapshot) {
		List<Finding> findings = new ArrayList<>();
		if (!integrityPassed) {
			findings.add(new Finding("INTEGRITY_REVIEW_REQUIRED", Severity.WARNING, "本局数据需要复核",
					"事件顺序或计分汇总未通过完整性检查。", "先保留记录，不把本局用于 AI 深度分析或长期趋势基线。"));
			return List.copyOf(findings);
		}
		if (summary.accuracy() >= 90 && summary.consistencyScore() >= 75) {
			findings.add(new Finding("CONTROL_FOUNDATION", Severity.POSITIVE, "准度和节奏都守住了",
					format("准确率 %.1f%%，稳定性 %.0f 分，最大连击 %d。", summary.accuracy(),
							summary.consistencyScore(), summary.maxCombo()),
					"保留这套点击节奏，下一局只调整一个小变量。"));
		}
		else if (summary.maxCombo() >= 8) {
			findings.add(new Finding("COMBO_STRENGTH", Severity.POSITIVE, "已经找到连续命中的状态",
					format("本局最高连击 %d，共完成 %d 次命中。", summary.maxCombo(), summary.hits()),
					"保留连击阶段的节奏，再把这种状态维持得更久。"));
		}
		if (summary.accuracy() < 85) {
			findings.add(new Finding("ACCURACY_LIMITS_PACE", Severity.OPPORTUNITY, "命中质量正在限制得分",
					format("共点击 %d 次，命中 %d、失误 %d，本局准确率 %.1f%%。",
							summary.hits() + summary.misses(), summary.hits(), summary.misses(), summary.accuracy()),
					"先不要继续加速。准星进入目标轮廓后再点击，优先减少无效点击。"));
		}
		if (trend.hasEvidence() && trend.accuracyDelta() <= -5) {
			boolean tradedControlForPace = trend.paceDelta() >= 10;
			findings.add(new Finding(tradedControlForPace ? "PACE_CONTROL_TRADEOFF" : "LATE_ACCURACY_DROP",
					Severity.OPPORTUNITY,
					tradedControlForPace ? "后段提速换来了控制损失" : "最后阶段出现明显掉准度",
					tradedControlForPace
							? format("后段命中速度提高 %.1f TPM，但准确率下降 %.1f 个百分点。",
									trend.paceDelta(), Math.abs(trend.accuracyDelta()))
							: format("第一阶段 %.1f%%，最后阶段 %.1f%%，下降 %.1f 个百分点。",
									trend.firstAccuracy(), trend.lastAccuracy(), Math.abs(trend.accuracyDelta())),
					tradedControlForPace ? "末段先回到中段速度，守住点击确认后再加速。"
							: "最后三分之一保持与中段相同的点击确认节奏。"));
		}
		if (summary.hits() >= 4 && summary.consistencyScore() < 70) {
			findings.add(new Finding("RHYTHM_INSTABILITY", Severity.OPPORTUNITY, "相邻两次命中的间隔不够稳定",
					format("本局稳定度 %.0f / 100，命中间隔存在明显波动。", summary.consistencyScore()),
					"连续五次命中保持相近的移动和停枪节奏，先消除忽快忽慢。"));
		}
		if (summary.accuracy() >= 90 && summary.averageHitInterval() > 400) {
			findings.add(new Finding("PACE_OPPORTUNITY", Severity.OPPORTUNITY, "稳定基础上还可以小幅提速",
					format("准确率 %.1f%%，平均命中间隔 %.0fms。", summary.accuracy(), summary.averageHitInterval()),
					"保持点击确认不变，每次切换只提前约 30ms，逐步压缩空档。"));
		}
		if (trend.hasEvidence() && trend.accuracyDelta() >= 5 && trend.lastAccuracy() >= summary.accuracy()
				&& trend.lastTpm() >= trend.firstTpm()) {
			findings.add(new Finding("STRONG_FINISH", Severity.POSITIVE, "最后阶段比开局更稳",
					format("后程准确率提升 %.1f 个百分点，同时节奏没有下降。", trend.accuracyDelta()),
					"复用最后阶段的视线和点击节奏，让这种状态更早出现。"));
		}
		if (trend.hasEvidence() && trend.paceDelta() <= -Math.max(10, trend.firstTpm() * 0.1)
				&& trend.accuracyDelta() > -5 && trend.accuracyDelta() < 3) {
			findings.add(new Finding("LATE_PACE_DROP", Severity.OPPORTUNITY, "后段命中速度出现回落",
					format("命中速度从前段 %.1f 降到后段 %.1f TPM，准确率没有同步提升。",
							trend.firstTpm(), trend.lastTpm()),
					"最后三分之一保持前段的观察与点击节拍，减少额外停顿。"));
		}
		if (findings.stream().noneMatch(finding -> finding.severity() == Severity.POSITIVE)) {
			BestPhase best = bestObservedPhase(snapshot);
			if (best != null) {
				findings.add(new Finding("BEST_PHASE_CONTROL", Severity.POSITIVE,
						format("第 %d 阶段最值得复用", best.index() + 1),
						format("该阶段准确率 %.1f%%，命中速度 %.1f TPM。", best.accuracy(), best.tpm()),
						"下一局从开局就复用这一阶段的观察与点击节拍。"));
			}
		}
		if (findings.isEmpty() && summary.accuracy() >= 90) {
			findings.add(new Finding("CONTROL_FOUNDATION", Severity.POSITIVE, "速度、准确率和节奏都比较稳定",
					format("准确率 %.1f%%，稳定性 %.0f 分，最大连击 %d。", summary.accuracy(),
							summary.consistencyScore(), summary.maxCombo()),
					"下一局只提高一个变量：小幅提速，同时守住当前准确率。"));
		}
		if (findings.isEmpty()) {
			findings.add(new Finding("BASELINE_ESTABLISHED", Severity.POSITIVE, "已建立第一份有效基线",
					format("本局记录了 %d 次命中和 %d 次失误。", summary.hits(), summary.misses()),
					"再完成两到三局同配置训练，系统就能更可靠地判断趋势。"));
		}
		Focus focus = focus(summary, trend, integrityPassed);
		String focusCode = switch (focus) {
			case ACCURACY -> "ACCURACY_LIMITS_PACE";
			case RHYTHM -> "RHYTHM_INSTABILITY";
			case LATE -> "LATE_ACCURACY_DROP";
			case TRADEOFF -> "PACE_CONTROL_TRADEOFF";
			case LATE_PACE -> "LATE_PACE_DROP";
			case PACE -> "PACE_OPPORTUNITY";
			default -> "";
		};
		findings.sort((left, right) -> {
			if (left.severity() == Severity.POSITIVE && right.severity() != Severity.POSITIVE) return -1;
			if (right.severity() == Severity.POSITIVE && left.severity() != Severity.POSITIVE) return 1;
			return Boolean.compare(right.code().equals(focusCode), left.code().equals(focusCode));
		});
		return List.copyOf(findings.subList(0, Math.min(3, findings.size())));
	}

	private static String headline(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) return "先复核数据，再判断训练表现";
		Focus focus = focus(summary, trend, true);
		if (focus == Focus.RHYTHM && summary.maxCombo() >= 8) return "连击已经出现，先把命中节奏稳定下来";
		if (focus == Focus.RHYTHM) return "命中节奏的波动是这局主要问题";
		if (focus == Focus.ACCURACY && summary.maxCombo() >= 8) return "连击已经打出来，但失误正在限制得分";
		if (focus == Focus.ACCURACY) return "无效点击正在拉低这局得分";
		if (focus == Focus.TRADEOFF) return "后段提速了，但点击控制没有跟上";
		if (focus == Focus.LATE) return "最后阶段没有守住前面的状态";
		if (focus == Focus.LATE_PACE) return "后段节奏放慢，是这局最明显的变化";
		if (focus == Focus.PACE) return "控制已经稳定，可以开始压缩空档";
		if (trend.hasEvidence() && trend.accuracyDelta() >= 5) return "最后阶段更稳，把这个节奏提前复制";
		return "整体表现稳定，下一步把高质量连击拉长";
	}

	private static String overviewEnding(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) return "本局暂不进入长期趋势判断。";
		Focus focus = focus(summary, trend, true);
		if (focus == Focus.RHYTHM) return "这局更需要处理命中间隔波动，而不是继续追求瞬时速度。";
		if (focus == Focus.ACCURACY) return "当前得分损失主要来自无效点击，下一局适合先减少失误。";
		if (focus == Focus.TRADEOFF) return "后段速度提高了，但准确率同步下降；提速后需要守住点击确认。";
		if (focus == Focus.LATE) return "前面打得不错，但最后阶段拉低了整体表现。";
		if (focus == Focus.LATE_PACE) return "后段命中速度回落且没有换来更高准确率，应优先维持前段节拍。";
		if (focus == Focus.PACE) return "控制基础已经够用，可以小幅缩短目标切换空档。";
		return "当前表现没有明显短板，适合进行小幅渐进加速。";
	}

	private static NextAction nextAction(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) {
			return new NextAction("完成一局有效基线", "保持当前配置重新训练，确保事件和计分完整。",
					List.of(new Target("integrity", "数据完整", Operator.AT_LEAST, 1, "通过")));
		}
		Focus focus = focus(summary, trend, true);
		if (focus == Focus.RHYTHM) {
			return new NextAction("先把点击间隔打匀", "先不追求更快，连续几次命中保持相近的切换和停枪节奏。",
					List.of(new Target("consistencyScore", "稳定性", Operator.AT_LEAST,
							round(Math.min(75, summary.consistencyScore() + 10)), "分")));
		}
		if (focus == Focus.ACCURACY) {
			return new NextAction("先把无效点击压下来", "保持现在的命中速度，每次点击前多留一次确认。",
					List.of(new Target("accuracy", "准确率", Operator.AT_LEAST,
							round(Math.min(90, summary.accuracy() + 5)), "%")));
		}
		if (focus == Focus.LATE || focus == Focus.TRADEOFF) {
			double target = trend.lastAccuracy() + Math.min(5, Math.max(2, Math.abs(trend.accuracyDelta()) / 2));
			return new NextAction(focus == Focus.TRADEOFF ? "提速时守住点击确认" : "把前段状态带到最后",
					focus == Focus.TRADEOFF ? "末段先回到中段速度，确认准确率稳定后再逐步加速。"
							: "最后三分之一沿用中段节奏，不额外抢速度。",
					List.of(new Target("lastPhaseAccuracy", "后程准确率", Operator.AT_LEAST,
							round(Math.min(95, target)), "%")));
		}
		if (focus == Focus.LATE_PACE) {
			return new NextAction("把前段节拍保持到结束", "保持点击确认不变，重点减少后段额外停顿。",
					List.of(new Target("targetsPerMinute", "命中速度", Operator.AT_LEAST,
							round(summary.targetsPerMinute() + 5), "TPM")));
		}
		if (focus == Focus.PACE) {
			double intervalTarget = Math.max(280, Math.round(summary.averageHitInterval() - 30));
			return new NextAction("准确率不掉，小幅提速", "每次切换提前约 30ms，不改变点击确认动作。",
					List.of(new Target("averageHitInterval", "平均命中间隔", Operator.AT_MOST, intervalTarget, "ms")));
		}
		return new NextAction("把高质量连击拉长", "保持现在的整体控制，把连续命中的状态多延长几次。",
				List.of(new Target("maxCombo", "最高连击", Operator.AT_LEAST, summary.maxCombo() + 3, "次")));
	}

	private static BestPhase bestObservedPhase(JsonNode snapshot) {
		JsonNode windows = snapshot.path("windows");
		BestPhase best = null;
		for (int index = 0; windows.isArray() && index < windows.size(); index += 1) {
			JsonNode window = windows.get(index);
			int attempts = window.path("hits").asInt(0) + window.path("misses").asInt(0);
			if (attempts < 3) continue;
			BestPhase candidate = new BestPhase(index, finite(window, "accuracy"),
					finite(window, "targetsPerMinute"));
			if (best == null || candidate.accuracy() > best.accuracy()
					|| candidate.accuracy() == best.accuracy() && candidate.tpm() > best.tpm()) {
				best = candidate;
			}
		}
		return best;
	}

	private static PhaseTrend phaseTrend(JsonNode snapshot) {
		JsonNode windows = snapshot.path("windows");
		if (!windows.isArray() || windows.size() < 2) return PhaseTrend.empty();
		JsonNode first = windows.get(0);
		JsonNode last = windows.get(windows.size() - 1);
		int firstAttempts = first.path("hits").asInt(0) + first.path("misses").asInt(0);
		int lastAttempts = last.path("hits").asInt(0) + last.path("misses").asInt(0);
		double firstAccuracy = finite(first, "accuracy");
		double lastAccuracy = finite(last, "accuracy");
		return new PhaseTrend(firstAttempts >= 3 && lastAttempts >= 3, firstAccuracy, lastAccuracy,
				finite(first, "targetsPerMinute"), finite(last, "targetsPerMinute"));
	}

	private static double finite(JsonNode node, String field) {
		JsonNode value = node.get(field);
		return value != null && value.isNumber() && Double.isFinite(value.asDouble()) ? value.asDouble() : 0;
	}

	private static double round(double value) {
		return Math.round(value * 10d) / 10d;
	}

	private static String format(String template, Object... values) {
		return String.format(Locale.ROOT, template, values);
	}

	private record PhaseTrend(boolean hasEvidence, double firstAccuracy, double lastAccuracy,
			double firstTpm, double lastTpm) {

		static PhaseTrend empty() {
			return new PhaseTrend(false, 0, 0, 0, 0);
		}

		double accuracyDelta() {
			return lastAccuracy - firstAccuracy;
		}

		double paceDelta() {
			return lastTpm - firstTpm;
		}
	}

	private record BestPhase(int index, double accuracy, double tpm) {}
}
