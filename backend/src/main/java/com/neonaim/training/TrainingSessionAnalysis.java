package com.neonaim.training;

import com.neonaim.training.api.TrainingAnalysisResult;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "training_session_analyses")
class TrainingSessionAnalysis {

	@Id
	@Column(name = "session_id", nullable = false)
	private UUID sessionId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private TrainingAnalysisResult.Status status;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private TrainingAnalysisResult.Source source;

	@Column(name = "engine_version", nullable = false, length = 80)
	private String engineVersion;

	@Column(name = "provider_id", length = 80)
	private String providerId;

	@Column(name = "model_name", length = 120)
	private String modelName;

	@Column(name = "prompt_version", length = 80)
	private String promptVersion;

	@Column(name = "input_tokens", nullable = false)
	private int inputTokens;

	@Column(name = "output_tokens", nullable = false)
	private int outputTokens;

	@Column(name = "result_json", nullable = false, columnDefinition = "TEXT")
	private String resultJson;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected TrainingSessionAnalysis() {
	}

	TrainingSessionAnalysis(UUID sessionId, TrainingAnalysisResult result, String resultJson) {
		this.sessionId = sessionId;
		this.status = result.status();
		this.source = result.source();
		this.engineVersion = result.engineVersion();
		this.providerId = result.providerId();
		this.modelName = result.model();
		this.promptVersion = result.promptVersion();
		this.inputTokens = result.usage().inputTokens();
		this.outputTokens = result.usage().outputTokens();
		this.resultJson = resultJson;
		this.createdAt = result.generatedAt();
		this.updatedAt = result.generatedAt();
	}

	void update(TrainingAnalysisResult result, String updatedResultJson) {
		this.status = result.status();
		this.source = result.source();
		this.engineVersion = result.engineVersion();
		this.providerId = result.providerId();
		this.modelName = result.model();
		this.promptVersion = result.promptVersion();
		this.inputTokens = result.usage().inputTokens();
		this.outputTokens = result.usage().outputTokens();
		this.resultJson = updatedResultJson;
		this.updatedAt = result.generatedAt();
	}

	UUID sessionId() { return sessionId; }
	TrainingAnalysisResult.Status status() { return status; }
	TrainingAnalysisResult.Source source() { return source; }
	String engineVersion() { return engineVersion; }
	String providerId() { return providerId; }
	String modelName() { return modelName; }
	String promptVersion() { return promptVersion; }
	int inputTokens() { return inputTokens; }
	int outputTokens() { return outputTokens; }
	String resultJson() { return resultJson; }
	Instant createdAt() { return createdAt; }
	Instant updatedAt() { return updatedAt; }
}
