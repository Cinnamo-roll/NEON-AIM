package com.neonaim.training.api;

import java.util.UUID;

/**
 * Read-only boundary used by career AI orchestration. Implementations must
 * return a bounded aggregate snapshot and never expose raw gameplay events.
 */
public interface TrainingCareerAnalysisOperations {

	CareerContext loadCareerAnalysisContext(UUID userId, String trainingId);

	enum Confidence {
		INITIAL,
		LOW,
		STABLE
	}

	record CareerContext(UUID anchorSessionId, TrainingAnalysisSnapshot snapshot,
			Confidence confidence, int sampleSize, int comparableSampleSize,
			int configurationCount) {
	}
}
