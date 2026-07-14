package com.neonaim.training.api;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Boundary used by training persistence to notify the coaching task module.
 * Implementations must not let coaching evaluation affect session persistence.
 */
public interface TrainingCoachingTaskOperations {

	void evaluateCompletedSession(CompletedSession session);

	record CompletedSession(UUID userId, UUID sessionId, String trainingId,
			int modeVersion, int scoringVersion, String configurationKey,
			Instant startedAt, Instant completedAt, boolean integrityPassed,
			Map<String, Double> metrics) {

		public CompletedSession {
			metrics = Map.copyOf(metrics);
		}
	}
}
