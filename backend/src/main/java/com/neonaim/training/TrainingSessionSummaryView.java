package com.neonaim.training;

import java.time.Instant;
import java.util.UUID;

public record TrainingSessionSummaryView(
		UUID id,
		String clientSessionId,
		String trainingId,
		int modeVersion,
		int scoringVersion,
		String configurationKey,
		String sessionType,
		Instant startedAt,
		Instant completedAt,
		long durationMs,
		double score,
		int hits,
		int misses,
		double accuracy,
		double targetsPerMinute,
		double averageHitInterval,
		double consistencyScore,
		int maxCombo,
		String grade,
		TrainingSession.IntegrityStatus integrityStatus,
		String analysisDataVersion) {
}
