package com.neonaim.ai;

import java.util.Optional;

import com.neonaim.training.api.TrainingAnalysisSnapshot;

public interface TrainingAnalysisCache {

	Optional<TrainingAnalysisProvider.AnalysisResult> find(CacheKey key);

	void put(CacheKey key, TrainingAnalysisProvider.AnalysisResult result);

	record CacheKey(TrainingAnalysisSnapshot.Scope scope, String sourceId, String dataVersion,
			String promptVersion, String providerId) {
	}
}
