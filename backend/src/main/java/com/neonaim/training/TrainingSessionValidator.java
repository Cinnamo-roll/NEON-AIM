package com.neonaim.training;

import java.util.Map;

interface TrainingSessionValidator {

	String trainingId();

	void validate(TrainingSessionSubmission submission);

	default Map<String, Double> coachingMetrics(TrainingSessionSubmission submission) {
		return Map.of();
	}
}
