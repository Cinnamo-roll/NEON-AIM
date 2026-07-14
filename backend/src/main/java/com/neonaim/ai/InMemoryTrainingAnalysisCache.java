package com.neonaim.ai;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * Bounded local cache for development and tests. A shared Redis implementation
 * can replace it without changing the analysis gateway.
 */
public final class InMemoryTrainingAnalysisCache implements TrainingAnalysisCache {

	private final int maximumEntries;
	private final Map<CacheKey, TrainingAnalysisProvider.AnalysisResult> entries;

	public InMemoryTrainingAnalysisCache(int maximumEntries) {
		if (maximumEntries <= 0) {
			throw new IllegalArgumentException("maximumEntries must be positive");
		}
		this.maximumEntries = maximumEntries;
		this.entries = new LinkedHashMap<>(16, 0.75f, true);
	}

	@Override
	public synchronized Optional<TrainingAnalysisProvider.AnalysisResult> find(CacheKey key) {
		return Optional.ofNullable(entries.get(Objects.requireNonNull(key, "key")));
	}

	@Override
	public synchronized void put(CacheKey key, TrainingAnalysisProvider.AnalysisResult result) {
		Objects.requireNonNull(key, "key");
		Objects.requireNonNull(result, "result");
		if (!entries.containsKey(key) && entries.size() >= maximumEntries) {
			CacheKey eldest = entries.keySet().iterator().next();
			entries.remove(eldest);
		}
		entries.put(key, result);
	}
}
