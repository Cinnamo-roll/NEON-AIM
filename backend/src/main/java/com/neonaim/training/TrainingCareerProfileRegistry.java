package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingCareerAnalysisOperations;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
class TrainingCareerProfileRegistry implements TrainingCareerAnalysisOperations {

	private final Map<String, TrainingCareerProfileStrategy> strategies;

	TrainingCareerProfileRegistry(List<TrainingCareerProfileStrategy> strategies) {
		Map<String, TrainingCareerProfileStrategy> indexed = new LinkedHashMap<>();
		for (TrainingCareerProfileStrategy strategy : strategies) {
			TrainingCareerProfileStrategy duplicate = indexed.put(strategy.trainingId(), strategy);
			if (duplicate != null) {
				throw new IllegalStateException("duplicate training career strategy: " + strategy.trainingId());
			}
		}
		this.strategies = Map.copyOf(indexed);
	}

	Object profile(UUID userId, String trainingId) {
		return strategy(trainingId).profile(userId);
	}

	@Override
	public CareerContext loadCareerAnalysisContext(UUID userId, String trainingId) {
		return strategy(trainingId).loadCareerAnalysisContext(userId);
	}

	private TrainingCareerProfileStrategy strategy(String trainingId) {
		TrainingCareerProfileStrategy strategy = strategies.get(trainingId);
		if (strategy == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_UNSUPPORTED", "该训练模式尚未开放能力档案");
		}
		return strategy;
	}
}
