package com.neonaim.training;

import com.neonaim.common.error.ApiException;
import com.neonaim.training.api.TrainingAnalysisResult;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
class TrainingRuleAnalysisEngine {

	private final Map<String, TrainingRuleAnalysisStrategy> strategies;
	private final Clock clock;

	TrainingRuleAnalysisEngine(List<TrainingRuleAnalysisStrategy> strategies, Clock clock) {
		Map<String, TrainingRuleAnalysisStrategy> indexed = new LinkedHashMap<>();
		for (TrainingRuleAnalysisStrategy strategy : strategies) {
			TrainingRuleAnalysisStrategy duplicate = indexed.put(strategy.trainingId(), strategy);
			if (duplicate != null) {
				throw new IllegalStateException("duplicate training analysis strategy: " + strategy.trainingId());
			}
		}
		this.strategies = Map.copyOf(indexed);
		this.clock = clock;
	}

	TrainingAnalysisResult analyze(String trainingId, TrainingRuleAnalysisContext context) {
		TrainingRuleAnalysisStrategy strategy = strategies.get(trainingId);
		if (strategy == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_ANALYSIS_UNSUPPORTED",
					"该训练模式尚未提供即时分析");
		}
		return strategy.analyze(context, clock.instant());
	}
}
