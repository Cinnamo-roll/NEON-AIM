package com.neonaim.training.api;

import java.util.Objects;
import java.util.UUID;

/**
 * Narrow training-module boundary used by asynchronous analysis jobs. It exposes
 * only the bounded snapshot and never the raw event stream.
 */
public interface TrainingSessionAnalysisOperations {

	AnalysisContext loadAnalysisContext(UUID userId, UUID sessionId);

	void applyAiAnalysis(UUID userId, UUID sessionId, TrainingAnalysisResult result);

	record AnalysisContext(UUID sessionId, TrainingAnalysisSnapshot snapshot,
			TrainingAnalysisResult currentAnalysis) {

		public AnalysisContext {
			Objects.requireNonNull(sessionId, "sessionId");
			Objects.requireNonNull(snapshot, "snapshot");
			Objects.requireNonNull(currentAnalysis, "currentAnalysis");
		}
	}
}
