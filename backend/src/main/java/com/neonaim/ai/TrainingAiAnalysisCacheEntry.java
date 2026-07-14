package com.neonaim.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "training_ai_analysis_cache")
class TrainingAiAnalysisCacheEntry {

	@Id
	@Column(name = "cache_key", nullable = false, length = 64)
	private String cacheKey;

	@Column(nullable = false, length = 16)
	private String scope;

	@Column(name = "source_id", nullable = false, length = 100)
	private String sourceId;

	@Column(name = "data_version", nullable = false, length = 100)
	private String dataVersion;

	@Column(name = "prompt_version", nullable = false, length = 80)
	private String promptVersion;

	@Column(name = "provider_id", nullable = false, length = 160)
	private String providerId;

	@Column(name = "result_json", nullable = false, columnDefinition = "TEXT")
	private String resultJson;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected TrainingAiAnalysisCacheEntry() {
	}

	TrainingAiAnalysisCacheEntry(String cacheKey, TrainingAnalysisCache.CacheKey key,
			String resultJson, Instant createdAt) {
		this.cacheKey = cacheKey;
		this.scope = key.scope().name();
		this.sourceId = key.sourceId();
		this.dataVersion = key.dataVersion();
		this.promptVersion = key.promptVersion();
		this.providerId = key.providerId();
		this.resultJson = resultJson;
		this.createdAt = createdAt;
	}

	String resultJson() {
		return resultJson;
	}
}
