package com.neonaim.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "training_ai_analysis_calls")
class TrainingAiAnalysisCall {

	enum Status { PENDING, READY, FAILED, BUDGET_EXHAUSTED }

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "session_id", nullable = false)
	private UUID sessionId;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 24)
	private Status status;

	@Column(name = "provider_id", nullable = false, length = 160)
	private String providerId;

	@Column(name = "model_name", nullable = false, length = 120)
	private String modelName;

	@Column(name = "prompt_version", nullable = false, length = 80)
	private String promptVersion;

	@Column(name = "data_version", nullable = false, length = 100)
	private String dataVersion;

	@Column(name = "cache_hit", nullable = false)
	private boolean cacheHit;

	@Column(name = "input_tokens", nullable = false)
	private int inputTokens;

	@Column(name = "output_tokens", nullable = false)
	private int outputTokens;

	@Column(name = "duration_ms")
	private Long durationMs;

	@Column(name = "failure_code", length = 100)
	private String failureCode;

	@Column(name = "failure_message", length = 400)
	private String failureMessage;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "completed_at")
	private Instant completedAt;

	protected TrainingAiAnalysisCall() {
	}

	TrainingAiAnalysisCall(UUID userId, UUID sessionId, String providerId, String modelName,
			String promptVersion, String dataVersion, Instant createdAt) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.sessionId = sessionId;
		this.status = Status.PENDING;
		this.providerId = providerId;
		this.modelName = modelName;
		this.promptVersion = promptVersion;
		this.dataVersion = dataVersion;
		this.createdAt = createdAt;
	}

	void complete(TrainingAnalysisProvider.TokenUsage usage, boolean wasCacheHit, Instant completed) {
		status = Status.READY;
		cacheHit = wasCacheHit;
		inputTokens = wasCacheHit ? 0 : usage.inputTokens();
		outputTokens = wasCacheHit ? 0 : usage.outputTokens();
		finish(completed);
	}

	void budgetExhausted(Instant completed) {
		status = Status.BUDGET_EXHAUSTED;
		failureCode = "AI_DAILY_BUDGET_EXHAUSTED";
		failureMessage = "今日 AI 分析额度已用完，规则建议仍可正常使用";
		finish(completed);
	}

	void fail(String code, String message, Instant completed) {
		fail(code, message, new TrainingAnalysisProvider.TokenUsage(0, 0), completed);
	}

	void fail(String code, String message, TrainingAnalysisProvider.TokenUsage usage, Instant completed) {
		status = Status.FAILED;
		failureCode = code;
		failureMessage = message;
		inputTokens = usage.inputTokens();
		outputTokens = usage.outputTokens();
		finish(completed);
	}

	private void finish(Instant completed) {
		completedAt = completed;
		durationMs = Math.max(0, Duration.between(createdAt, completed).toMillis());
	}

	UUID id() { return id; }
	UUID userId() { return userId; }
	UUID sessionId() { return sessionId; }
	Status status() { return status; }
	String providerId() { return providerId; }
	String modelName() { return modelName; }
	String promptVersion() { return promptVersion; }
	String dataVersion() { return dataVersion; }
	boolean cacheHit() { return cacheHit; }
	int inputTokens() { return inputTokens; }
	int outputTokens() { return outputTokens; }
	Long durationMs() { return durationMs; }
	String failureCode() { return failureCode; }
	String failureMessage() { return failureMessage; }
	Instant createdAt() { return createdAt; }
	Instant completedAt() { return completedAt; }
}
