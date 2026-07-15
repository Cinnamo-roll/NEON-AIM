package com.neonaim.ai;

import com.neonaim.training.api.TrainingAnalysisSnapshot;
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
			Respond in concise Simplified Chinese. First check for a clearly evidenced strength. When one exists,
			headline and summary must acknowledge it before any weakness, and the first finding must be POSITIVE.
			Then give at most one main improvement backed by numbers and one measurable next-run goal. Do not invent
			a flaw just to provide advice. Return no more than two findings and two targets.
			Target metrics must be one of: accuracy, consistencyScore, targetsPerMinute, averageHitInterval,
			lastPhaseAccuracy, maxCombo. Operators must be AT_LEAST or AT_MOST.
			""";

	private static final String SESSION_INSTRUCTIONS = """

			For SESSION scope, comparison contains at most five recent valid sessions with the same configuration and rule versions.
			With no comparison or fewer than two samples, analyze only the current session. Call two to four samples an early trend,
			and only call a comparison established when sampleSize reaches five. Never present within-session phase variation as a long-term trend.
			""";

	private static final String CAREER_INSTRUCTIONS = """

			For CAREER scope, windows are recent sessions ordered oldest to newest. If comparableSampleSize is below 5,
			call the result an initial observation. If configurations are mixed, never claim improvement or decline
			between different durations or target sizes. Only a same-configuration comparison can support a trend claim.
			Use scorePerMinute rather than raw score across durations. When configurationKey is grid-shot:60s:medium
			and BENCHMARK_BASELINE is present, the input is the standard comparable benchmark baseline.
			""";

	@Override
	public String trainingId() {
		return "grid-shot";
	}

	@Override
	public PromptSpec prompt(TrainingAnalysisSnapshot.Scope scope) {
		return scope == TrainingAnalysisSnapshot.Scope.SESSION
				? new PromptSpec("grid-shot-session-v5", "ai-analysis-v1",
						BASE_INSTRUCTIONS + SESSION_INSTRUCTIONS, SUPPORTED_TARGET_METRICS)
				: new PromptSpec("grid-shot-career-v2", "grid-shot-career-ai-v2",
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

	private static void requireRange(double value, double minimum, double maximum) {
		if (value < minimum || value > maximum) {
			throw new IllegalStateException("provider returned an out-of-range target");
		}
	}
}
