package com.neonaim.ai;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

class TrainingAnalysisQualityGateTests {

	private final TrainingAnalysisQualityGate gate = new TrainingAnalysisQualityGate(
			new GridShotTrainingAiAnalysisStrategy());

	@ParameterizedTest(name = "accepts grounded scenario {0}")
	@MethodSource("groundedScenarios")
	void acceptsFiveGroundedGridShotScenarios(String name, TrainingAnalysisSnapshot snapshot,
			TrainingAnalysisProvider.AnalysisResult result) {
		assertThatNoException().isThrownBy(() -> gate.validate(snapshot, result));
	}

	@Test
	void rejectsClaimsAboutReactionTimeThatWasNeverSupplied() {
		TrainingAnalysisSnapshot snapshot = snapshot("fabricated", 120, 84.6, 198, 72,
				windows(88, 85, 81), signal("ACCURACY_LIMITS_PACE", Map.of("accuracy", 84.6)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("FABRICATED_REACTION",
				"反应时间偏慢", "反应时间为 198ms。", "accuracy", 90,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("not supplied");
	}

	@Test
	void rejectsNumericEvidenceThatDoesNotExistInTheSnapshot() {
		TrainingAnalysisSnapshot snapshot = snapshot("ungrounded", 120, 91.3, 137, 78,
				windows(94.2, 91.9, 87.8), signal("LATE_ACCURACY_DROP", Map.of("accuracyDelta", -6.4)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("UNGROUNDED_NUMBER",
				"证据不匹配", "第三阶段准确率为 42.7%。", "lastPhaseAccuracy", 90,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("not grounded");
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"稳定度远低于目标 75 分。",
			"当前仍属于初步趋势。"
	})
	void rejectsMisleadingFixedTargetAndVagueTrendLanguage(String evidence) {
		TrainingAnalysisSnapshot snapshot = snapshot("misleading-label", 172, 75.8, 172, 20,
				windows(77.9, 77.3, 72.4), signal("RHYTHM_INSTABILITY", Map.of("consistencyScore", 20d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("RHYTHM_INSTABILITY",
				"节奏需要调整", evidence, "consistencyScore", 30,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("not supplied");
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"首阶段 100% 命中，第三阶段稳定度降至 23，显示疲劳或注意力分散。",
			"后段表现下降，说明用户已经分心。",
			"稳定度下降可能是紧张造成的。",
			"The late decline suggests fatigue or attention loss."
	})
	void rejectsUnsupportedPhysicalOrMentalCauseClaims(String evidence) {
		TrainingAnalysisSnapshot snapshot = snapshot("unsupported-cause", 150, 96.2, 150, 56,
				windows(100, 95.7, 92.9), signal("LATE_ACCURACY_DROP",
						Map.of("firstAccuracy", 100d, "lastAccuracy", 92.9d, "accuracyDelta", -7.1d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("LATE_ACCURACY_DROP",
				"后段控制出现回落", evidence, "lastPhaseAccuracy", 97.9,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("not supplied");
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"lastAccuracy:81.4, firstAccuracy:75.8, accuracyDelta:5.6",
			"consistencyScore:19.0, averageHitInterval:363.2ms"
	})
	void rejectsInternalMetricKeysInUserFacingText(String evidence) {
		TrainingAnalysisSnapshot snapshot = snapshot("internal-keys", 150, 81.4, 165, 19,
				windows(75.8, 87.1, 81.4), signal("STRONG_FINISH",
						Map.of("firstAccuracy", 75.8d, "lastAccuracy", 81.4d, "accuracyDelta", 5.6d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("STRONG_FINISH",
				"后段准确率有所提升", evidence, "consistencyScore", 29,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("not supplied");
	}

	@Test
	void rejectsInternalMetricKeysUsedAsTargetLabels() {
		TrainingAnalysisSnapshot snapshot = snapshot("internal-target-label", 150, 91.4, 165, 69,
				windows(92, 91, 91.2), signal("RHYTHM_INSTABILITY", Map.of("consistencyScore", 69d)), true);
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"点击节奏仍可更均匀", "稳定度为 69 分，下一局优先缩小节奏波动。",
				List.of(new TrainingAnalysisProvider.Finding("RHYTHM_INSTABILITY",
						TrainingAnalysisProvider.Severity.OPPORTUNITY, "节奏存在波动", "稳定度为 69 分。",
						"下一局保持点击间隔均匀。")),
				new TrainingAnalysisProvider.NextAction("稳定点击节奏", "保持相同训练配置。",
						List.of(new TrainingAnalysisProvider.Target("consistencyScore", "consistencyScore",
								TrainingAnalysisProvider.Operator.AT_LEAST, 79, "分"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(200, 80));

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("not supplied");
	}

	@Test
	void acceptsTextEvidenceWhenItReusesASuppliedSignalCode() {
		TrainingAnalysisSnapshot snapshot = snapshot("signaled-text", 180, 89.3, 180, 74,
				windows(95, 91, 82), signal("LATE_ACCURACY_DROP",
						Map.of("firstAccuracy", 95d, "lastAccuracy", 82d, "accuracyDelta", -13d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("LATE_ACCURACY_DROP",
				"后段命中下降", "后段准确率低于起步阶段。", "lastPhaseAccuracy", 87,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatNoException().isThrownBy(() -> gate.validate(snapshot, result));
	}

	@Test
	void acceptsAnUnsignedMagnitudeWhenTheSnapshotStoresANegativeDelta() {
		TrainingAnalysisSnapshot snapshot = snapshot("natural-decline", 180, 89.3, 180, 74,
				windows(95, 91, 88.6), signal("LATE_ACCURACY_DROP",
						Map.of("firstAccuracy", 95d, "lastAccuracy", 88.6d, "accuracyDelta", -6.4d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("DECLINE_MAGNITUDE",
				"后段命中下降", "后段准确率下降 6.4 个百分点。", "lastPhaseAccuracy", 90,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatNoException().isThrownBy(() -> gate.validate(snapshot, result));
	}

	@Test
	void rejectsTextEvidenceWithoutASuppliedSignalOrGroundedNumber() {
		TrainingAnalysisSnapshot snapshot = snapshot("invented-text", 180, 89.3, 180, 74,
				windows(95, 91, 82), signal("LATE_ACCURACY_DROP",
						Map.of("firstAccuracy", 95d, "lastAccuracy", 82d, "accuracyDelta", -13d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("INVENTED_PATTERN",
				"出现未知问题", "训练中出现了未提供的模式。", "accuracy", 90,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("not grounded");
	}

	@Test
	void rejectsEvidenceWhenOnlyOneOfSeveralNumbersExistsInTheSnapshot() {
		TrainingAnalysisSnapshot snapshot = snapshot("partially-grounded", 120, 91.3, 137, 78,
				windows(94.2, 91.9, 87.8), signal("LATE_ACCURACY_DROP", Map.of("accuracyDelta", -6.4)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("LATE_ACCURACY_DROP",
				"后段命中下降", "整体准确率 91.3%，第三阶段准确率 42.7%。", "lastPhaseAccuracy", 90,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("not grounded");
	}

	@Test
	void rejectsUngroundedNumbersOutsideTheEvidenceField() {
		TrainingAnalysisSnapshot snapshot = snapshot("ungrounded-summary", 120, 91.3, 137, 78,
				windows(94.2, 91.9, 87.8), signal("LATE_ACCURACY_DROP", Map.of("accuracyDelta", -6.4)), true);
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"后段准确率需要稳定", "整体准确率 91.3%，第三阶段准确率 42.7%。",
				List.of(new TrainingAnalysisProvider.Finding("LATE_ACCURACY_DROP",
						TrainingAnalysisProvider.Severity.OPPORTUNITY, "后段准确率下降",
						"第三阶段准确率为 87.8%。", "下一局优先守住后段节奏。")),
				new TrainingAnalysisProvider.NextAction("稳定后段准确率", "保持相同训练配置。",
						List.of(new TrainingAnalysisProvider.Target("lastPhaseAccuracy", "后段准确率",
								TrainingAnalysisProvider.Operator.AT_LEAST, 90, "%"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(200, 80));

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("user-facing number is not grounded");
	}

	@Test
	void acceptsAValidatedTargetValueInTheNextActionText() {
		TrainingAnalysisSnapshot snapshot = snapshot("target-in-description", 120, 91.3, 137, 78,
				windows(94.2, 91.9, 87.8), signal("LATE_ACCURACY_DROP", Map.of("accuracyDelta", -6.4)), true);
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"后段准确率需要稳定", "整体准确率为 91.3%，第三阶段为 87.8%。",
				List.of(new TrainingAnalysisProvider.Finding("LATE_ACCURACY_DROP",
						TrainingAnalysisProvider.Severity.OPPORTUNITY, "后段准确率下降",
						"第三阶段准确率为 87.8%。", "下一局优先守住后段节奏。")),
				new TrainingAnalysisProvider.NextAction("稳定后段准确率", "下一局先把后段准确率保持在 90%。",
						List.of(new TrainingAnalysisProvider.Target("lastPhaseAccuracy", "后段准确率",
								TrainingAnalysisProvider.Operator.AT_LEAST, 90, "%"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(200, 80));

		assertThatNoException().isThrownBy(() -> gate.validate(snapshot, result));
	}

	@Test
	void rejectsUnsupportedOrDirectionallyWrongTargets() {
		TrainingAnalysisSnapshot snapshot = snapshot("bad-target", 120, 84.6, 198, 72,
				windows(88, 85, 81), signal("ACCURACY_LIMITS_PACE", Map.of("accuracy", 84.6)), true);
		TrainingAnalysisProvider.AnalysisResult unsupported = result("BAD_TARGET",
				"准确率限制速度", "本局准确率 84.6%。", "reactionTime", 180,
				TrainingAnalysisProvider.Operator.AT_MOST);
		TrainingAnalysisProvider.AnalysisResult wrongDirection = result("BAD_DIRECTION",
				"间隔仍可降低", "平均间隔为 198ms。", "averageHitInterval", 180,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, unsupported))
				.hasMessageContaining("unsupported target metric");
		assertThatThrownBy(() -> gate.validate(snapshot, wrongDirection))
				.hasMessageContaining("must use AT_MOST");
	}

	@Test
	void rejectsAnalysisThatDropsAnEvidencedStrength() {
		TrainingAnalysisSnapshot snapshot = snapshot("strength", 120, 78.4, 172, 20,
				windows(80, 78, 77.2), new TrainingAnalysisSnapshot.Signal("COMBO_STRENGTH",
						TrainingAnalysisSnapshot.Severity.POSITIVE, Map.of("maxCombo", 10d)), true);
		TrainingAnalysisProvider.AnalysisResult result = result("RHYTHM_INSTABILITY",
				"节奏波动明显", "本局稳定度只有 20 分。", "consistencyScore", 30,
				TrainingAnalysisProvider.Operator.AT_LEAST);

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("omitted an evidenced strength");
	}

	@Test
	void rejectsCareerReportThatRepeatsASectionTitle() {
		TrainingAnalysisSnapshot snapshot = careerSnapshot();
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"Recent accuracy declined", "Long-term control and recent direction need separate review.",
				List.of(
						new TrainingAnalysisProvider.Finding("RHYTHM_INSTABILITY",
								TrainingAnalysisProvider.Severity.OPPORTUNITY, "Rhythm is the main constraint",
								"Consistency is 30.8.", "This limits repeatable pace."),
						new TrainingAnalysisProvider.Finding("RECENT_DECLINE",
								TrainingAnalysisProvider.Severity.OPPORTUNITY, "Recent accuracy declined",
								"Accuracy changed by 6.8 percentage points.", "The change is based on matching setups.")),
				new TrainingAnalysisProvider.NextAction("Narrow rhythm variation",
						"Use the same setup for 3 sessions and keep one focus.",
						List.of(new TrainingAnalysisProvider.Target("consistencyScore", "Stability",
								TrainingAnalysisProvider.Operator.AT_LEAST, 40, "points"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(300, 120));

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("section titles must be distinct");
	}

	@Test
	void acceptsCareerReportWithDistinctRolesAndARealisticTrainingBlock() {
		TrainingAnalysisSnapshot snapshot = careerSnapshot();
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"Control varies more than pace", "The long-term profile points to repeatability as the clearest limiter.",
				List.of(
						new TrainingAnalysisProvider.Finding("RHYTHM_INSTABILITY",
								TrainingAnalysisProvider.Severity.OPPORTUNITY, "Rhythm is the main constraint",
								"Consistency is 30.8.", "This limits repeatable pace."),
						new TrainingAnalysisProvider.Finding("RECENT_DECLINE",
								TrainingAnalysisProvider.Severity.OPPORTUNITY, "Matching-set results moved down",
								"Accuracy changed by 6.8 percentage points.", "The comparison uses matching setups.")),
				new TrainingAnalysisProvider.NextAction("Make the click rhythm repeatable",
						"Use the same setup for 3 sessions and keep one focus.",
						List.of(new TrainingAnalysisProvider.Target("consistencyScore", "Stability",
								TrainingAnalysisProvider.Operator.AT_LEAST, 40, "points"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(300, 120));

		assertThatNoException().isThrownBy(() -> gate.validate(snapshot, result));
	}

	@Test
	void rejectsCareerCopyThatLeaksRawDecimalPrecision() {
		TrainingAnalysisSnapshot snapshot = careerSnapshot();
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"Control varies more than pace", "Repeatability is the clearest issue in the current history.",
				List.of(new TrainingAnalysisProvider.Finding("RHYTHM_INSTABILITY",
						TrainingAnalysisProvider.Severity.OPPORTUNITY, "Rhythm varies too much",
						"Consistency is 30.812345.", "This makes the pace hard to repeat.")),
				new TrainingAnalysisProvider.NextAction("Make the click rhythm repeatable",
						"Use the same setup for 3 sessions and keep one focus.",
						List.of(new TrainingAnalysisProvider.Target("consistencyScore", "Stability",
								TrainingAnalysisProvider.Operator.AT_LEAST, 40, "points"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(300, 120));

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("at most two decimal places");
	}

	@Test
	void rejectsCareerSummaryThatRepeatsMetrics() {
		TrainingAnalysisSnapshot snapshot = careerSnapshot();
		TrainingAnalysisProvider.AnalysisResult result = new TrainingAnalysisProvider.AnalysisResult(
				"Control varies more than pace", "The history contains 22 sessions with 81.6 percent accuracy.",
				List.of(new TrainingAnalysisProvider.Finding("RHYTHM_INSTABILITY",
						TrainingAnalysisProvider.Severity.OPPORTUNITY, "Rhythm varies too much",
						"Consistency is 30.8.", "This makes the pace hard to repeat.")),
				new TrainingAnalysisProvider.NextAction("Make the click rhythm repeatable",
						"Use the same setup for 3 sessions and keep one focus.",
						List.of(new TrainingAnalysisProvider.Target("consistencyScore", "Stability",
								TrainingAnalysisProvider.Operator.AT_LEAST, 40, "points"))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(300, 120));

		assertThatThrownBy(() -> gate.validate(snapshot, result))
				.hasMessageContaining("without a metric dump");
	}

	private static TrainingAnalysisSnapshot careerSnapshot() {
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.CAREER,
				"grid-shot:all-history", "career-v1", "grid-shot", "grid-shot:all-history", 22,
				Map.of("validSessionCount", 22d, "configurationCount", 5d,
						"averageAccuracy", 81.6d, "recentAccuracy", 80.6d,
						"averageTargetsPerMinute", 170.4d, "recentConsistencyScore", 30.8d),
				List.of(new TrainingAnalysisSnapshot.Window("R1", 0, 60_000,
						Map.of("lastPhaseAccuracy", 80.6d, "maxCombo", 57d))),
				List.of(
						new TrainingAnalysisSnapshot.Signal("RHYTHM_INSTABILITY",
								TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
								Map.of("consistencyScore", 30.8d)),
						new TrainingAnalysisSnapshot.Signal("RECENT_DECLINE",
								TrainingAnalysisSnapshot.Severity.OPPORTUNITY,
								Map.of("accuracyDelta", -6.8d, "consistencyScoreDelta", -9d))),
				new TrainingAnalysisSnapshot.Comparison(6,
						Map.of("accuracyDelta", -6.8d, "consistencyScoreDelta", -9d)),
				new TrainingAnalysisSnapshot.Integrity(true, List.of()));
	}

	private static Stream<Arguments> groundedScenarios() {
		return Stream.of(
				Arguments.of("stable-high-accuracy",
						snapshot("stable", 150, 96.2, 150, 92, windows(96, 97, 95.6),
								signal("PACE_OPPORTUNITY", Map.of("accuracy", 96.2, "averageHitInterval", 420d)), true),
						result("PACE_OPPORTUNITY", "稳定性很好", "准确率 96.2%，平均间隔 420ms。",
								"averageHitInterval", 400, TrainingAnalysisProvider.Operator.AT_MOST)),
				Arguments.of("fast-low-accuracy",
						snapshot("fast", 210, 78.4, 210, 66, windows(80, 78, 77.2),
								signal("ACCURACY_LIMITS_PACE", Map.of("accuracy", 78.4, "targetAccuracy", 90d)), true),
						result("ACCURACY_LIMITS_PACE", "速度超过控制", "当前速度 210 TPM，但准确率只有 78.4%。",
								"accuracy", 83.4, TrainingAnalysisProvider.Operator.AT_LEAST)),
				Arguments.of("late-accuracy-drop",
						snapshot("late", 180, 89.3, 180, 74, windows(95, 91, 82),
								signal("LATE_ACCURACY_DROP", Map.of("firstAccuracy", 95d, "lastAccuracy", 82d,
										"accuracyDelta", -13d)), true),
						result("LATE_ACCURACY_DROP", "后段命中下降", "第一阶段 95%，第三阶段降到 82%。",
								"lastPhaseAccuracy", 87, TrainingAnalysisProvider.Operator.AT_LEAST)),
				Arguments.of("unstable-rhythm",
						snapshot("rhythm", 165, 88.5, 165, 58, windows(89, 88, 88.5),
								signal("RHYTHM_INSTABILITY", Map.of("consistencyScore", 58d, "targetConsistency", 75d)), true),
						result("RHYTHM_INSTABILITY", "节奏波动明显", "节奏稳定度只有 58 分。",
								"consistencyScore", 68, TrainingAnalysisProvider.Operator.AT_LEAST)),
				Arguments.of("low-sample-integrity-review",
						snapshot("integrity", 12, 50, 12, 0, windows(50, 0, 0),
								signal("INTEGRITY_REVIEW_REQUIRED", Map.of()), false),
						result("INTEGRITY_REVIEW_REQUIRED", "数据量不足", "本局只有 12 次有效样本，先复核数据。",
								"accuracy", 80, TrainingAnalysisProvider.Operator.AT_LEAST)));
	}

	private static TrainingAnalysisSnapshot snapshot(String sourceId, int sampleSize, double accuracy,
			double targetsPerMinute, double consistency, List<TrainingAnalysisSnapshot.Window> windows,
			TrainingAnalysisSnapshot.Signal signal, boolean integrityPassed) {
		return new TrainingAnalysisSnapshot(1, TrainingAnalysisSnapshot.Scope.SESSION, sourceId, "data-v1",
				"grid-shot", "grid-shot:60s:medium", sampleSize,
				Map.of("score", targetsPerMinute * 100, "accuracy", accuracy,
						"targetsPerMinute", targetsPerMinute, "consistencyScore", consistency,
						"averageHitInterval", targetsPerMinute),
				windows, List.of(signal), null,
				new TrainingAnalysisSnapshot.Integrity(integrityPassed,
						integrityPassed ? List.of() : List.of("LOW_SAMPLE_SIZE")));
	}

	private static List<TrainingAnalysisSnapshot.Window> windows(double first, double middle, double last) {
		return List.of(
				window("phase1", 0, 20_000, first),
				window("phase2", 20_000, 40_000, middle),
				window("phase3", 40_000, 60_000, last));
	}

	private static TrainingAnalysisSnapshot.Window window(String label, long startMs, long endMs, double accuracy) {
		return new TrainingAnalysisSnapshot.Window(label, startMs, endMs,
				Map.of("accuracy", accuracy, "targetsPerMinute", accuracy));
	}

	private static TrainingAnalysisSnapshot.Signal signal(String code, Map<String, Double> evidence) {
		return new TrainingAnalysisSnapshot.Signal(code, TrainingAnalysisSnapshot.Severity.OPPORTUNITY, evidence);
	}

	private static TrainingAnalysisProvider.AnalysisResult result(String code, String title, String evidence,
			String targetMetric, double targetValue, TrainingAnalysisProvider.Operator operator) {
		return new TrainingAnalysisProvider.AnalysisResult(title, title + "，下一局按目标调整。",
				List.of(new TrainingAnalysisProvider.Finding(code, TrainingAnalysisProvider.Severity.OPPORTUNITY,
						title, evidence, "下一局只调整这一项。")),
				new TrainingAnalysisProvider.NextAction("下一局目标", "保持其余条件不变。",
						List.of(new TrainingAnalysisProvider.Target(targetMetric, label(targetMetric),
								operator, targetValue, unit(targetMetric)))),
				"acceptance-model", new TrainingAnalysisProvider.TokenUsage(200, 80));
	}

	private static String unit(String metric) {
		return switch (metric) {
			case "accuracy", "lastPhaseAccuracy" -> "%";
			case "consistencyScore" -> "分";
			case "targetsPerMinute" -> "TPM";
			case "averageHitInterval", "reactionTime" -> "ms";
			case "maxCombo" -> "次";
			default -> "value";
		};
	}

	private static String label(String metric) {
		return switch (metric) {
			case "accuracy" -> "准确率";
			case "lastPhaseAccuracy" -> "后段准确率";
			case "consistencyScore" -> "稳定度";
			case "targetsPerMinute" -> "命中速度";
			case "averageHitInterval" -> "平均命中间隔";
			case "maxCombo" -> "最高连击";
			default -> "训练指标";
		};
	}
}
