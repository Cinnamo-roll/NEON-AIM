package com.neonaim.training;

import java.time.Instant;
import java.util.UUID;

public record TrainingCareerSessionView(
		UUID id,
		String configurationKey,
		String sessionType,
		int modeVersion,
		int scoringVersion,
		Instant completedAt,
		double score,
		long durationMs,
		double accuracy,
		double targetsPerMinute,
		double averageHitInterval,
		double consistencyScore,
		int maxCombo,
		TrainingSession.IntegrityStatus integrityStatus,
		String analysisSnapshotJson,
		String analysisDataVersion) {
}
