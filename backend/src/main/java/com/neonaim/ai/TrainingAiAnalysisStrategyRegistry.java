package com.neonaim.ai;

import com.neonaim.common.error.ApiException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
class TrainingAiAnalysisStrategyRegistry {

	private final Map<String, TrainingAiAnalysisStrategy> strategies;

	TrainingAiAnalysisStrategyRegistry(List<TrainingAiAnalysisStrategy> strategies) {
		Map<String, TrainingAiAnalysisStrategy> indexed = new LinkedHashMap<>();
		for (TrainingAiAnalysisStrategy strategy : strategies) {
			TrainingAiAnalysisStrategy duplicate = indexed.put(strategy.trainingId(), strategy);
			if (duplicate != null) {
				throw new IllegalStateException("duplicate training AI strategy: " + strategy.trainingId());
			}
		}
		this.strategies = Map.copyOf(indexed);
	}

	TrainingAiAnalysisStrategy require(String trainingId) {
		TrainingAiAnalysisStrategy strategy = strategies.get(trainingId);
		if (strategy == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_AI_UNSUPPORTED",
					"该训练项目暂不支持 AI 分析");
		}
		return strategy;
	}
}
