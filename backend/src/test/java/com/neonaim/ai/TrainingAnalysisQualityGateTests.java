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

class TrainingAnalysisQualityGateTests {

	private final TrainingAnalysisQualityGate gate = new TrainingAnalysisQualityGate();

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
								"accuracy", 90, TrainingAnalysisProvider.Operator.AT_LEAST)),
				Arguments.of("late-accuracy-drop",
						snapshot("late", 180, 89.3, 180, 74, windows(95, 91, 82),
								signal("LATE_ACCURACY_DROP", Map.of("firstAccuracy", 95d, "lastAccuracy", 82d,
										"accuracyDelta", -13d)), true),
						result("LATE_ACCURACY_DROP", "后段命中下降", "第一阶段 95%，第三阶段降到 82%。",
								"lastPhaseAccuracy", 90, TrainingAnalysisProvider.Operator.AT_LEAST)),
				Arguments.of("unstable-rhythm",
						snapshot("rhythm", 165, 88.5, 165, 58, windows(89, 88, 88.5),
								signal("RHYTHM_INSTABILITY", Map.of("consistencyScore", 58d, "targetConsistency", 75d)), true),
						result("RHYTHM_INSTABILITY", "节奏波动明显", "节奏稳定度只有 58 分。",
								"consistencyScore", 75, TrainingAnalysisProvider.Operator.AT_LEAST)),
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
						List.of(new TrainingAnalysisProvider.Target(targetMetric, targetMetric,
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
}
