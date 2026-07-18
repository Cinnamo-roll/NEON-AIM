package com.neonaim.training;

public record TrainingCareerCohortAggregateView(
		String configurationKey,
		int modeVersion,
		int scoringVersion,
		String sessionType,
		long sessionCount,
		long totalDurationMs,
		double averageScorePerMinute,
		double bestScorePerMinute,
		double averageAccuracy,
		double averageTargetsPerMinute,
		double averageHitInterval,
		double averageConsistencyScore,
		double averageMaxCombo) {
}
