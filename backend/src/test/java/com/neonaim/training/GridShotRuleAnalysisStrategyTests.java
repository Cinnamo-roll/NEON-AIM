package com.neonaim.training;

import static org.assertj.core.api.Assertions.assertThat;

import com.neonaim.training.api.TrainingAnalysisResult;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class GridShotRuleAnalysisStrategyTests {

	private static final Instant GENERATED_AT = Instant.parse("2026-07-14T05:00:00Z");
	private final GridShotRuleAnalysisStrategy strategy = new GridShotRuleAnalysisStrategy();
	private final ObjectMapper objectMapper = new ObjectMapper();

	@Test
	void prioritizesARealLateSessionDropAndCreatesMeasurableTargets() throws Exception {
		TrainingAnalysisResult result = analyze(summary(92, 138, 360, 82), true, """
				{"windows":[
				  {"hits":46,"misses":3,"accuracy":94,"targetsPerMinute":138},
				  {"hits":45,"misses":4,"accuracy":91.8,"targetsPerMinute":135},
				  {"hits":43,"misses":7,"accuracy":86,"targetsPerMinute":139}
				]}
				""");

		assertThat(result.headline()).contains("后程稳定性");
		assertThat(result.findings()).extracting(TrainingAnalysisResult.Finding::code)
				.containsExactly("LATE_ACCURACY_DROP");
		assertThat(result.nextAction().targets()).extracting(TrainingAnalysisResult.Target::metric)
				.containsExactly("lastPhaseAccuracy", "consistencyScore");
		assertThat(result.usage().totalTokens()).isZero();
	}

	@Test
	void recommendsControlledPaceOnlyAfterAccuracyIsStable() throws Exception {
		TrainingAnalysisResult result = analyze(summary(94, 112, 450, 84), true,
				"{\"windows\":[]}");

		assertThat(result.findings()).extracting(TrainingAnalysisResult.Finding::code)
				.containsExactly("PACE_OPPORTUNITY");
		assertThat(result.nextAction().targets().getFirst().metric()).isEqualTo("averageHitInterval");
		assertThat(result.nextAction().targets().getFirst().value()).isEqualTo(420);
	}

	@Test
	void invalidEvidenceIsKeptOutOfLongTermCoaching() throws Exception {
		TrainingAnalysisResult result = analyze(summary(96, 145, 350, 90), false,
				"{\"windows\":[]}");

		assertThat(result.findings().getFirst().code()).isEqualTo("INTEGRITY_REVIEW_REQUIRED");
		assertThat(result.nextAction().targets()).extracting(TrainingAnalysisResult.Target::metric)
				.containsExactly("integrity");
	}

	private TrainingAnalysisResult analyze(TrainingSessionSubmission.Summary summary, boolean integrityPassed,
			String snapshotJson) throws Exception {
		JsonNode snapshot = objectMapper.readTree(snapshotJson);
		TrainingRuleAnalysisContext context = new TrainingRuleAnalysisContext("session-1", "data-v1",
				summary, snapshot, integrityPassed);
		return strategy.analyze(context, GENERATED_AT);
	}

	private static TrainingSessionSubmission.Summary summary(double accuracy, double targetsPerMinute,
			double averageHitInterval, double consistency) {
		return new TrainingSessionSubmission.Summary(18_000, 100, 5, accuracy, targetsPerMinute,
				averageHitInterval, consistency, 24, "A");
	}
}
