package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
class GridShotTrainingAiAnalysisStrategy implements TrainingAiAnalysisStrategy {

	private static final Set<String> SUPPORTED_TARGET_METRICS = Set.of(
			"accuracy", "consistencyScore", "targetsPerMinute", "averageHitInterval",
			"lastPhaseAccuracy", "maxCombo");

	private static final String BASE_INSTRUCTIONS = """
			You are NEON AIM's Grid Shot coach. Analyze only the compact evidence supplied by the app.
			Never invent mouse movement, target positions, reaction time, or events that are not present.
			A within-session decline proves only that the measured performance changed. Never diagnose or speculate
			about fatigue, attention loss, distraction, anxiety, physical condition, mental state, or hardware causes.
			Describe the observable metric change directly, for example "第三阶段稳定度下降，需要优先守住后段节奏".
			Internal field names are machine-only. Never expose camelCase keys or key:value dumps such as
			firstAccuracy, lastAccuracy, accuracyDelta, consistencyScore, or averageHitInterval in user-facing text
			or target labels. Translate them into natural Chinese: 第一阶段准确率、第三阶段准确率、准确率变化、稳定度、
			平均命中间隔, and write a complete sentence.
			Respond in concise Simplified Chinese. First check for a clearly evidenced strength. When one exists,
			headline and summary must acknowledge it before any weakness, and the first finding must be POSITIVE.
			Then give at most one main improvement backed by numbers and one measurable next-run goal. Do not invent
			a flaw just to provide advice. Return no more than three findings and two targets.
			Treat accuracy, hit rhythm, late-session control, pace, and combo length as peer dimensions. Compare the
			relative size of the evidenced problems and choose the strongest limiter; never default to accuracy merely
			because it is below a fixed threshold. If a positive signal is supplied, include it as a POSITIVE finding.
			Evidence keys beginning with target are rule references, not a goal selected by the player. Never describe
			the player as "far below target" and never present 90 accuracy or 75 consistency as universal goals.
			Make the next-run target an achievable step from the current value: at most +5 accuracy points, +10 consistency
			points, +5 TPM, +3 combo, or 30ms less averageHitInterval. Prefer one target for the chosen main improvement.
			Keep the JSON focused but sufficiently detailed: headline at most 28 Chinese characters, summary at most 140 Chinese characters,
			each finding title at most 22, evidence at most 80, advice at most 48, next-action title at most 22,
			and next-action description at most 90. Do not repeat the same evidence in multiple fields.
			When a finding describes a supplied signal, copy that signal's code exactly. Otherwise its evidence must quote
			at least one numeric literal exactly as supplied in the snapshot; never recalculate evidence numbers. Snapshot
			numbers are already rounded for presentation. Never display more than two digits after a decimal point.
			averageHitInterval means the interval between hits and must never be described as reaction time.
			medianHitInterval is the robust center of consecutive-hit intervals; fastestHitInterval and
			slowestHitInterval are range endpoints and must not outweigh the median or consistency score.
			averageTargetLifetime is the average time a target remained visible before it was hit. Because
			three targets coexist, it is not reaction time and cannot by itself prove slow reactions or bad aim.
			Use all supplied reliable dimensions when choosing the main limiter, but do not turn derivative
			score components or isolated extremes into separate flaws. BEST_PHASE_CONTROL is relative to this
			run only. PACE_CONTROL_TRADEOFF means late speed rose while accuracy fell; LATE_PACE_DROP means
			late hit pace fell without a compensating accuracy gain.
			Target metrics must be one of: accuracy, consistencyScore, targetsPerMinute, averageHitInterval,
			lastPhaseAccuracy, maxCombo. Operators must be AT_LEAST or AT_MOST.
			""";

	private static final String SESSION_INSTRUCTIONS = """

			For SESSION scope, comparison contains at most five recent valid sessions with the same configuration and rule versions.
			With no comparison or fewer than two samples, analyze only the current session. With two to four samples,
			state the exact number of comparable sessions instead of using a vague label such as "初步趋势". Only call a
			comparison established when sampleSize reaches five. Never present within-session phase variation as a long-term trend.
			""";

	private static final String CAREER_INSTRUCTIONS = """

			For CAREER scope, the snapshot represents the player's complete valid GRID SHOT history. summaryMetrics are
			database aggregates over all valid standard and practice sessions; they are not a selectable analysis range.
			Windows are only the latest six compact sessions, ordered oldest to newest, and their labels identify standard
			or practice plus configuration. Use them as recent context, never as the whole history.
			Different durations, target sizes, mode versions, and scoring versions are not directly comparable. Never compare
			raw scores across configurations. Use scorePerMinute for descriptive context only. A recent trend claim is allowed
			only when comparison is present: its deltas were calculated inside exact comparable cohorts and then aggregated.
			Do not infer a trend from mixed-configuration windows or from lifetime and recent averages alone.
			The answer is a serious user-facing training report, not a collection of slogans. Every field has one distinct job:
			- headline: describe the overall ability structure in one natural sentence. Do not use a RECENT_* finding title here.
			- summary: explain the long-term picture and how the main dimensions relate in natural language. It must contain no
			  numeric literals; all concrete numbers belong in finding evidence so the same metric is not repeated.
			- findings: include an actual demonstrated ability strength only when a POSITIVE ability signal supports it; include
			  the supplied RECENT_* change when present; and include at most one main limiter. A finding's evidence states what
			  happened, while its advice explains why it matters. Advice must not repeat the training plan.
			- nextAction: give one focused block of 3 to 5 matching-configuration sessions, say what to practise, and provide at
			  most two achievable measurable targets derived from supplied recent or lifetime values.
			Never mention the total record count or configuration count in the report. Never call record count, configuration
			count, persistence, or data coverage an ability strength. If no positive ability signal exists, do not invent a
			strength. Do not write generic claims such as \"training foundation is solid\".
			Do not turn standard and practice counts into competing scores. Headline, finding titles, and next-action title must
			be meaningfully different: none may repeat or contain another title. Do not restate one conclusion under multiple labels.
			Use natural player-facing Chinese. Avoid awkward titles such as \"提升稳定度训练\" or \"加强命中率训练\"; name the
			specific outcome instead, such as narrowing rhythm fluctuation or preserving accuracy while increasing pace.
			Never use report labels such as "能力画像", "已确认的优势", "主要限制", "趋势含义", or "下一阶段训练方案"
			inside generated copy. Avoid title-only noun phrases ending in "训练", including "稳定节奏训练". The next-action
			title must sound like direct coaching, for example "先把后段节奏稳住" or "提速时守住准度".
			""";

	@Override
	public String trainingId() {
		return "grid-shot";
	}

	@Override
	public PromptSpec prompt(TrainingAnalysisSnapshot.Scope scope) {
		return scope == TrainingAnalysisSnapshot.Scope.SESSION
				? new PromptSpec("grid-shot-session-v11", "ai-analysis-v4",
						BASE_INSTRUCTIONS + SESSION_INSTRUCTIONS, SUPPORTED_TARGET_METRICS)
				: new PromptSpec("grid-shot-career-v11", "grid-shot-career-ai-v7",
						BASE_INSTRUCTIONS + CAREER_INSTRUCTIONS, SUPPORTED_TARGET_METRICS);
	}

	@Override
	public void validateTarget(TrainingAnalysisProvider.Target target) {
		if (!SUPPORTED_TARGET_METRICS.contains(target.metric())) {
			throw new IllegalStateException("provider returned an unsupported target metric");
		}
		double value = target.value();
		switch (target.metric()) {
			case "accuracy", "consistencyScore", "lastPhaseAccuracy" -> requireRange(value, 0, 100);
			case "targetsPerMinute" -> requireRange(value, 1, 600);
			case "averageHitInterval" -> requireRange(value, 50, 2_000);
			case "maxCombo" -> requireRange(value, 1, 1_000);
			default -> throw new IllegalStateException("provider returned an unsupported target metric");
		}
		if ("averageHitInterval".equals(target.metric())
				&& target.operator() != TrainingAnalysisProvider.Operator.AT_MOST) {
			throw new IllegalStateException("average hit interval targets must use AT_MOST");
		}
		if (!"averageHitInterval".equals(target.metric())
				&& target.operator() != TrainingAnalysisProvider.Operator.AT_LEAST) {
			throw new IllegalStateException("improvement targets must use AT_LEAST");
		}
	}

	@Override
	public void validateTarget(TrainingAnalysisSnapshot snapshot, TrainingAnalysisProvider.Target target) {
		validateTarget(target);
		if (!snapshot.integrity().passed()) return;
		Double current = currentValue(snapshot, target.metric());
		if (current == null) return;
		double maximumStep = switch (target.metric()) {
			case "accuracy", "lastPhaseAccuracy", "targetsPerMinute" -> 5;
			case "consistencyScore" -> 10;
			case "maxCombo" -> 3;
			case "averageHitInterval" -> 30;
			default -> 0;
		};
		if (target.operator() == TrainingAnalysisProvider.Operator.AT_LEAST
				&& target.value() > current + maximumStep + 0.1) {
			throw new IllegalStateException("provider returned an unrealistic one-session target");
		}
		if (target.operator() == TrainingAnalysisProvider.Operator.AT_MOST
				&& target.value() < current - maximumStep - 0.1) {
			throw new IllegalStateException("provider returned an unrealistic one-session target");
		}
	}

	@Override
	public Optional<TrainingAnalysisProvider.AnalysisResult> recoverRejectedResult(
			TrainingAnalysisSnapshot snapshot, TrainingAnalysisProvider.AnalysisResult result) {
		boolean career = snapshot.scope() == TrainingAnalysisSnapshot.Scope.CAREER;
		List<TrainingAnalysisProvider.Finding> findings = recoverFindings(snapshot, result.findings());
		List<TrainingAnalysisProvider.Target> targets = recoverTargets(snapshot, result.nextAction().targets());
		return Optional.of(new TrainingAnalysisProvider.AnalysisResult(
				safeText(result.headline(), career ? "训练档案已完成校准" : "本局表现已完成校准", 120),
				safeText(result.summary(), career
						? "AI 结论已根据全部有效 GRID SHOT 历史记录重新校准。"
						: "AI 结论已根据本局有效训练数据重新校准。", 320),
				findings,
				new TrainingAnalysisProvider.NextAction(
						safeText(result.nextAction().title(), career ? "下一阶段保持单一重点" : "下一局保持单一训练重点", 80),
						safeText(result.nextAction().description(), career
								? "从当前训练基础出发，优先完成下方量化目标。"
								: "保持当前训练配置，优先完成下方量化目标。", 240),
						targets),
				result.model(), result.usage()));
	}

	private List<TrainingAnalysisProvider.Finding> recoverFindings(TrainingAnalysisSnapshot snapshot,
			List<TrainingAnalysisProvider.Finding> supplied) {
		boolean career = snapshot.scope() == TrainingAnalysisSnapshot.Scope.CAREER;
		List<TrainingAnalysisProvider.Finding> recovered = new ArrayList<>();
		int count = Math.min(3, Math.max(1, supplied.size()));
		for (int index = 0; index < count; index++) {
			TrainingAnalysisProvider.Finding original = index < supplied.size() ? supplied.get(index) : null;
			TrainingAnalysisSnapshot.Signal signal = matchingSignal(snapshot, original, index);
			String fallbackTitle = signal == null
					? career ? "训练档案已完成复核" : "本局数据已完成复核"
					: signalTitle(signal.code());
			String code = signal != null ? signal.code()
					: original != null && original.code().matches("[A-Z0-9_]{3,64}")
							? original.code() : "SESSION_METRICS";
			recovered.add(new TrainingAnalysisProvider.Finding(code,
					signal == null && original != null ? original.severity() : severity(signal),
					safeText(original == null ? null : original.title(), fallbackTitle, 120),
					signal == null ? summaryEvidence(snapshot) : signalEvidence(snapshot, signal),
					safeText(original == null ? null : original.advice(),
							career ? "下一阶段只调整一个训练重点。" : "下一局保持相同配置，只调整一个训练重点。", 240)));
		}
		return List.copyOf(recovered);
	}

	private List<TrainingAnalysisProvider.Target> recoverTargets(TrainingAnalysisSnapshot snapshot,
			List<TrainingAnalysisProvider.Target> supplied) {
		List<TrainingAnalysisProvider.Target> recovered = new ArrayList<>();
		for (TrainingAnalysisProvider.Target target : supplied) {
			try {
				validateTarget(snapshot, target);
				recovered.add(new TrainingAnalysisProvider.Target(target.metric(), targetLabel(target.metric()),
						target.operator(), target.value(), targetUnit(target.metric())));
			}
			catch (RuntimeException ignored) {
				// Invalid model targets are replaced by the project strategy below.
			}
			if (recovered.size() == 2) break;
		}
		if (recovered.isEmpty()) recovered.add(fallbackTarget(snapshot));
		return List.copyOf(recovered);
	}

	private static TrainingAnalysisSnapshot.Signal matchingSignal(TrainingAnalysisSnapshot snapshot,
			TrainingAnalysisProvider.Finding finding, int index) {
		if (finding != null) {
			for (TrainingAnalysisSnapshot.Signal signal : snapshot.signals()) {
				if (signal.code().equals(finding.code())) return signal;
			}
		}
		return index < snapshot.signals().size() ? snapshot.signals().get(index) : null;
	}

	private static String signalEvidence(TrainingAnalysisSnapshot snapshot, TrainingAnalysisSnapshot.Signal signal) {
		if (signal.evidence().isEmpty()) return summaryEvidence(snapshot);
		return signal.evidence().entrySet().stream()
				.filter(entry -> !entry.getKey().startsWith("target"))
				.sorted(Map.Entry.comparingByKey())
				.limit(3)
				.map(entry -> metricLabel(entry.getKey()) + " " + exactNumber(entry.getValue()))
				.reduce((left, right) -> left + "，" + right)
				.orElseGet(() -> summaryEvidence(snapshot)) + "。";
	}

	private static String summaryEvidence(TrainingAnalysisSnapshot snapshot) {
		Double accuracy = snapshot.summaryMetrics().get(snapshot.scope() == TrainingAnalysisSnapshot.Scope.CAREER
				? "recentAccuracy" : "accuracy");
		Double pace = snapshot.summaryMetrics().get(snapshot.scope() == TrainingAnalysisSnapshot.Scope.CAREER
				? "averageTargetsPerMinute" : "targetsPerMinute");
		if (accuracy != null && pace != null) {
			return "准确率 " + exactNumber(accuracy) + "% ，命中速度 " + exactNumber(pace) + " TPM。";
		}
		if (!snapshot.summaryMetrics().isEmpty()) {
			Map.Entry<String, Double> metric = snapshot.summaryMetrics().entrySet().stream()
					.sorted(Map.Entry.comparingByKey()).findFirst().orElseThrow();
			return metricLabel(metric.getKey()) + " " + exactNumber(metric.getValue()) + "。";
		}
		return "有效样本 " + snapshot.sampleSize() + "。";
	}

	private TrainingAnalysisProvider.Target fallbackTarget(TrainingAnalysisSnapshot snapshot) {
		String signal = snapshot.signals().stream()
				.filter(candidate -> candidate.severity() == TrainingAnalysisSnapshot.Severity.OPPORTUNITY)
				.map(TrainingAnalysisSnapshot.Signal::code)
				.findFirst()
				.orElseGet(() -> snapshot.signals().isEmpty() ? "" : snapshot.signals().getFirst().code());
		if ("LATE_ACCURACY_DROP".equals(signal) || "PACE_CONTROL_TRADEOFF".equals(signal)) {
			double current = currentValue(snapshot, "lastPhaseAccuracy") == null
					? currentOrDefault(snapshot, "accuracy", 0d)
					: currentValue(snapshot, "lastPhaseAccuracy");
			return new TrainingAnalysisProvider.Target("lastPhaseAccuracy", "后段准确率",
					TrainingAnalysisProvider.Operator.AT_LEAST, clamp(current + 5, 0, 95), "%");
		}
		if ("RHYTHM_INSTABILITY".equals(signal)) {
			double consistency = currentOrDefault(snapshot, "consistencyScore", 0d);
			return new TrainingAnalysisProvider.Target("consistencyScore", "稳定度",
					TrainingAnalysisProvider.Operator.AT_LEAST, clamp(consistency + 10, 0, 75), "分");
		}
		if ("PACE_OPPORTUNITY".equals(signal)) {
			double interval = currentOrDefault(snapshot, "averageHitInterval", 400d);
			return new TrainingAnalysisProvider.Target("averageHitInterval", "平均命中间隔",
					TrainingAnalysisProvider.Operator.AT_MOST, clamp(interval - 30, 50, 2_000), "ms");
		}
		if ("LATE_PACE_DROP".equals(signal)) {
			double pace = currentOrDefault(snapshot, "targetsPerMinute", 1d);
			return new TrainingAnalysisProvider.Target("targetsPerMinute", "命中速度",
					TrainingAnalysisProvider.Operator.AT_LEAST, clamp(pace + 5, 1, 600), "TPM");
		}
		double accuracy = currentOrDefault(snapshot, "accuracy", 0d);
		if ("ACCURACY_LIMITS_PACE".equals(signal)) {
			return new TrainingAnalysisProvider.Target("accuracy", "准确率",
					TrainingAnalysisProvider.Operator.AT_LEAST, clamp(accuracy + 5, 0, 90), "%");
		}
		double combo = currentOrDefault(snapshot, "maxCombo", 1d);
		return new TrainingAnalysisProvider.Target("maxCombo", "最高连击",
				TrainingAnalysisProvider.Operator.AT_LEAST, clamp(combo + 3, 1, 1_000), "次");
	}

	private static Double currentValue(TrainingAnalysisSnapshot snapshot, String metric) {
		if ("lastPhaseAccuracy".equals(metric)) {
			if (snapshot.windows().isEmpty()) return null;
			return snapshot.windows().getLast().metrics().get("lastPhaseAccuracy");
		}
		if (snapshot.scope() == TrainingAnalysisSnapshot.Scope.CAREER) {
			return switch (metric) {
				case "accuracy" -> snapshot.summaryMetrics().get("recentAccuracy");
				case "consistencyScore" -> snapshot.summaryMetrics().get("recentConsistencyScore");
				case "targetsPerMinute" -> snapshot.summaryMetrics().get("averageTargetsPerMinute");
				case "averageHitInterval" -> snapshot.windows().isEmpty() ? null
						: snapshot.windows().getLast().metrics().get("averageHitInterval");
				case "maxCombo" -> snapshot.windows().stream()
						.map(window -> window.metrics().get("maxCombo"))
						.filter(java.util.Objects::nonNull).max(Double::compareTo).orElse(null);
				default -> snapshot.summaryMetrics().get(metric);
			};
		}
		return snapshot.summaryMetrics().get(metric);
	}

	private static double currentOrDefault(TrainingAnalysisSnapshot snapshot, String metric, double fallback) {
		Double current = currentValue(snapshot, metric);
		return current == null ? fallback : current;
	}

	private static TrainingAnalysisProvider.Severity severity(TrainingAnalysisSnapshot.Signal signal) {
		if (signal == null) return TrainingAnalysisProvider.Severity.OPPORTUNITY;
		return switch (signal.severity()) {
			case POSITIVE -> TrainingAnalysisProvider.Severity.POSITIVE;
			case OPPORTUNITY -> TrainingAnalysisProvider.Severity.OPPORTUNITY;
			case WARNING -> TrainingAnalysisProvider.Severity.WARNING;
		};
	}

	private static String signalTitle(String code) {
		return switch (code) {
			case "COMPARABLE_COHORT" -> "同配置训练记录可以进行比较";
			case "TRAINING_HISTORY_FOUNDATION" -> "已经形成可用的训练档案";
			case "CONTROL_FOUNDATION" -> "准度与节奏都保持稳定";
			case "RECENT_IMPROVEMENT" -> "近期同配置表现正在提升";
			case "RECENT_STABLE" -> "近期同配置表现保持稳定";
			case "RECENT_DECLINE" -> "近期同配置表现有所回落";
			case "COMBO_STRENGTH" -> "已经打出连续命中的状态";
			case "ACCURACY_LIMITS_PACE" -> "准确率正在限制有效速度";
			case "LATE_ACCURACY_DROP" -> "后段准确率需要稳定";
			case "STRONG_FINISH" -> "后段表现更稳定";
			case "RHYTHM_INSTABILITY" -> "命中节奏仍有波动";
			case "PACE_OPPORTUNITY" -> "稳定基础上可以提速";
			case "PACE_CONTROL_TRADEOFF" -> "后段提速带来了控制损失";
			case "LATE_PACE_DROP" -> "后段命中速度出现回落";
			case "BEST_PHASE_CONTROL" -> "这一阶段最值得复用";
			case "INTEGRITY_REVIEW_REQUIRED" -> "本局数据需要继续观察";
			default -> "本局数据已完成复核";
		};
	}

	private static String metricLabel(String metric) {
		return switch (metric) {
			case "comparableSampleSize" -> "同配置有效记录数";
			case "validSessionCount" -> "全部有效记录数";
			case "standardSessionCount" -> "标准训练记录数";
			case "practiceSessionCount" -> "自由练习记录数";
			case "configurationCount" -> "训练配置数";
			case "accuracy", "firstAccuracy", "lastAccuracy", "averageAccuracy", "recentAccuracy" -> "准确率";
			case "targetAccuracy" -> "规则准确率参考线";
			case "accuracyDelta" -> "准确率变化";
			case "targetsPerMinute", "averageTargetsPerMinute", "targetsPerMinuteDelta",
					"firstTargetsPerMinute", "lastTargetsPerMinute" -> "命中速度";
			case "averageScorePerMinute", "bestScorePerMinute", "recentScorePerMinute" -> "每分钟得分";
			case "scorePerMinuteDeltaPercent" -> "同配置每分钟得分变化";
			case "averageHitInterval" -> "平均命中间隔";
			case "medianHitInterval" -> "命中间隔中位数";
			case "fastestHitInterval" -> "最快命中间隔";
			case "slowestHitInterval" -> "最慢命中间隔";
			case "averageTargetLifetime" -> "目标平均停留时间";
			case "consistencyScore", "averageConsistencyScore", "recentConsistencyScore",
					"consistencyDelta", "consistencyScoreDelta" -> "稳定度";
			case "targetConsistency" -> "规则稳定度参考线";
			case "maxCombo" -> "最高连击";
			case "hits" -> "命中数";
			case "misses" -> "失误数";
			case "phase" -> "阶段";
			default -> metric;
		};
	}

	private static String targetLabel(String metric) {
		return switch (metric) {
			case "accuracy" -> "准确率";
			case "lastPhaseAccuracy" -> "后段准确率";
			case "consistencyScore" -> "稳定度";
			case "targetsPerMinute" -> "命中速度";
			case "averageHitInterval" -> "平均命中间隔";
			case "maxCombo" -> "最高连击";
			default -> metric;
		};
	}

	private static String targetUnit(String metric) {
		return switch (metric) {
			case "accuracy", "lastPhaseAccuracy" -> "%";
			case "consistencyScore" -> "分";
			case "targetsPerMinute" -> "TPM";
			case "averageHitInterval" -> "ms";
			case "maxCombo" -> "次";
			default -> "值";
		};
	}

	private static String safeText(String value, String fallback, int maximumLength) {
		String selected = value == null || value.isBlank()
				|| TrainingAnalysisQualityGate.containsUnsupportedClaim(value) ? fallback : value.trim();
		return selected.length() <= maximumLength ? selected : selected.substring(0, maximumLength);
	}

	private static String exactNumber(double value) {
		return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP)
				.stripTrailingZeros().toPlainString();
	}

	private static double clamp(double value, double minimum, double maximum) {
		return Math.max(minimum, Math.min(maximum, value));
	}

	private static void requireRange(double value, double minimum, double maximum) {
		if (value < minimum || value > maximum) {
			throw new IllegalStateException("provider returned an out-of-range target");
		}
	}
}
