package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
class TrainingSessionValidationEngine {

	private final Map<String, TrainingSessionValidator> validators;

	TrainingSessionValidationEngine(List<TrainingSessionValidator> validators) {
		Map<String, TrainingSessionValidator> indexed = new LinkedHashMap<>();
		for (TrainingSessionValidator validator : validators) {
			TrainingSessionValidator duplicate = indexed.put(validator.trainingId(), validator);
			if (duplicate != null) {
				throw new IllegalStateException("duplicate training session validator: " + validator.trainingId());
			}
		}
		this.validators = Map.copyOf(indexed);
	}

	void validate(TrainingSessionSubmission submission) {
		validator(submission.trainingId()).validate(submission);
	}

	Map<String, Double> coachingMetrics(TrainingSessionSubmission submission) {
		return validator(submission.trainingId()).coachingMetrics(submission);
	}

	private TrainingSessionValidator validator(String trainingId) {
		TrainingSessionValidator validator = validators.get(trainingId);
		if (validator == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_UNSUPPORTED", "该训练模式尚未开放数据保存");
		}
		return validator;
	}
}
