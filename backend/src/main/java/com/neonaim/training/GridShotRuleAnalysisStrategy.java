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
	static final String ENGINE_VERSION = "grid-shot-rules-v1";

	@Override
	public String trainingId() {
		return TRAINING_ID;
	}

	@Override
	public TrainingAnalysisResult analyze(TrainingRuleAnalysisContext context, Instant generatedAt) {
		TrainingSessionSubmission.Summary summary = context.summary();
		PhaseTrend phaseTrend = phaseTrend(context.snapshot());
		List<Finding> findings = findings(summary, phaseTrend, context.integrityPassed());
		String headline = headline(summary, phaseTrend, context.integrityPassed());
		String overview = format("本局完成 %d 次命中，准确率 %.1f%%，节奏 %.1f TPM，稳定性 %.0f 分。%s",
				summary.hits(), summary.accuracy(), summary.targetsPerMinute(), summary.consistencyScore(),
				overviewEnding(summary, phaseTrend, context.integrityPassed()));
		return TrainingAnalysisResult.rules(ENGINE_VERSION, headline, overview, findings,
				nextAction(summary, phaseTrend, context.integrityPassed()), generatedAt);
	}

	private static List<Finding> findings(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		List<Finding> findings = new ArrayList<>();
		if (!integrityPassed) {
			findings.add(new Finding("INTEGRITY_REVIEW_REQUIRED", Severity.WARNING, "本局数据需要复核",
					"事件顺序或计分汇总未通过完整性检查。", "先保留记录，不把本局用于 AI 深度分析或长期趋势基线。"));
		}
		if (summary.accuracy() < 85) {
			findings.add(new Finding("ACCURACY_LIMITS_PACE", Severity.OPPORTUNITY, "速度够快，但准确率没跟上",
					format("共点击 %d 次，命中 %d、失误 %d；准确率 %.1f%%，距离 90%% 目标还差 %.1f 个百分点。",
							summary.hits() + summary.misses(), summary.hits(), summary.misses(), summary.accuracy(),
							90 - summary.accuracy()),
					"先不要继续加速。准星进入目标轮廓后再点击，优先减少无效点击。"));
		}
		if (trend.hasEvidence() && trend.accuracyDelta() <= -5) {
			findings.add(new Finding("LATE_ACCURACY_DROP", Severity.OPPORTUNITY, "最后阶段出现明显掉准度",
					format("第一阶段 %.1f%%，最后阶段 %.1f%%，下降 %.1f 个百分点。",
							trend.firstAccuracy(), trend.lastAccuracy(), Math.abs(trend.accuracyDelta())),
					"最后三分之一不要追求瞬时爆发，保持与中段相同的点击确认节奏。"));
		}
		if (summary.hits() >= 4 && summary.consistencyScore() < 70) {
			findings.add(new Finding("RHYTHM_INSTABILITY", Severity.OPPORTUNITY, "相邻两次命中的间隔不够稳定",
					format("节奏稳定度为 %.0f / 100，建议先提升到 75 以上。", summary.consistencyScore()),
					"连续五次命中保持相近的移动和停枪节奏，先消除忽快忽慢。"));
		}
		if (summary.accuracy() >= 90 && summary.averageHitInterval() > 400) {
			findings.add(new Finding("PACE_OPPORTUNITY", Severity.POSITIVE, "准确率已经稳定，可以小幅提速",
					format("准确率 %.1f%%，平均命中间隔 %.0fms。", summary.accuracy(), summary.averageHitInterval()),
					"保持点击确认不变，每次切换只提前约 30ms，逐步压缩空档。"));
		}
		if (trend.hasEvidence() && trend.accuracyDelta() >= 5 && trend.lastTpm() >= trend.firstTpm()) {
			findings.add(new Finding("STRONG_FINISH", Severity.POSITIVE, "最后阶段比开局更稳",
					format("后程准确率提升 %.1f 个百分点，同时节奏没有下降。", trend.accuracyDelta()),
					"复用最后阶段的视线和点击节奏，让这种状态更早出现。"));
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
		return List.copyOf(findings.subList(0, Math.min(3, findings.size())));
	}

	private static String headline(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) return "先复核数据，再判断训练表现";
		if (summary.accuracy() < 85) return "先把准确率稳定到 90%，再继续提速";
		if (trend.hasEvidence() && trend.accuracyDelta() <= -5) return "最后阶段掉准度，先解决后程稳定性";
		if (summary.hits() >= 4 && summary.consistencyScore() < 70) return "速度不慢，但命中节奏忽快忽慢";
		if (summary.accuracy() >= 90 && summary.averageHitInterval() > 400) return "准确率已经够稳，可以开始小幅提速";
		if (trend.hasEvidence() && trend.accuracyDelta() >= 5) return "最后阶段更稳，把这个节奏提前复制";
		return "整体表现稳定，下一步把高质量连击拉长";
	}

	private static String overviewEnding(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) return "本局暂不进入长期趋势判断。";
		if (summary.accuracy() < 85) return "当前主要损失来自失误，而不是切换速度。";
		if (trend.hasEvidence() && trend.accuracyDelta() <= -5) return "总体表现受到最后阶段下滑限制。";
		if (summary.consistencyScore() < 70) return "平均速度可用，但命中间隔还不够均匀。";
		return "当前表现没有明显短板，适合进行小幅渐进加速。";
	}

	private static NextAction nextAction(TrainingSessionSubmission.Summary summary, PhaseTrend trend,
			boolean integrityPassed) {
		if (!integrityPassed) {
			return new NextAction("完成一局有效基线", "保持当前配置重新训练，确保事件和计分完整。",
					List.of(new Target("integrity", "数据完整", Operator.AT_LEAST, 1, "通过")));
		}
		if (summary.accuracy() < 85) {
			return new NextAction("准确率先做到 90%", "可以暂时慢一点，但每次点击都要确认准星已经进入目标。",
					List.of(new Target("accuracy", "准确率", Operator.AT_LEAST, 90, "%"),
							new Target("consistencyScore", "稳定性", Operator.AT_LEAST, 70, "分")));
		}
		if (trend.hasEvidence() && trend.accuracyDelta() <= -5) {
			double target = Math.min(95, Math.max(85, trend.firstAccuracy() - 2));
			return new NextAction("保持后程准确率", "前两段保持当前速度，最后阶段不要额外抢节奏。",
					List.of(new Target("lastPhaseAccuracy", "后程准确率", Operator.AT_LEAST, round(target), "%"),
							new Target("consistencyScore", "稳定性", Operator.AT_LEAST, 75, "分")));
		}
		if (summary.hits() >= 4 && summary.consistencyScore() < 70) {
			return new NextAction("连续五次稳定命中", "先消除忽快忽慢，再追求新的峰值速度。",
					List.of(new Target("consistencyScore", "稳定性", Operator.AT_LEAST, 75, "分"),
							new Target("accuracy", "准确率", Operator.AT_LEAST, Math.max(85, round(summary.accuracy())), "%")));
		}
		if (summary.accuracy() >= 90 && summary.averageHitInterval() > 400) {
			double intervalTarget = Math.max(280, Math.round(summary.averageHitInterval() - 30));
			return new NextAction("准确率不掉，小幅提速", "每次切换提前约 30ms，不改变点击确认动作。",
					List.of(new Target("averageHitInterval", "平均命中间隔", Operator.AT_MOST, intervalTarget, "ms"),
							new Target("accuracy", "准确率", Operator.AT_LEAST, 90, "%")));
		}
		return new NextAction("把高质量连击拉长", "维持当前准度，把稳定节奏保持到更长的 Combo。",
				List.of(new Target("accuracy", "准确率", Operator.AT_LEAST, Math.max(90, round(summary.accuracy())), "%"),
						new Target("targetsPerMinute", "目标/分钟", Operator.AT_LEAST,
								round(summary.targetsPerMinute() + 3), "TPM")));
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
	}
}
