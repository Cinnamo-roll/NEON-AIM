package com.neonaim.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "training_coaching_tasks")
class TrainingCoachingTask {

	enum Status { ACTIVE, COMPLETED, CANCELLED }

	enum EvaluationStatus { ACHIEVED, PARTIAL, NOT_ACHIEVED }

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "training_id", nullable = false, length = 64)
	private String trainingId;

	@Column(name = "source_analysis_call_id", nullable = false)
	private UUID sourceAnalysisCallId;

	@Column(name = "source_data_version", nullable = false, length = 100)
	private String sourceDataVersion;

	@Column(name = "configuration_key", nullable = false, length = 160)
	private String configurationKey;

	@Column(name = "mode_version", nullable = false)
	private int modeVersion;

	@Column(name = "scoring_version", nullable = false)
	private int scoringVersion;

	@Column(nullable = false, length = 160)
	private String title;

	@Column(nullable = false, length = 600)
	private String description;

	@Column(name = "targets_json", nullable = false, columnDefinition = "TEXT")
	private String targetsJson;

	@Column(name = "max_attempts", nullable = false)
	private int maxAttempts;

	@Column(name = "required_passes", nullable = false)
	private int requiredPasses;

	@Column(name = "attempts_json", nullable = false, columnDefinition = "TEXT")
	private String attemptsJson;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private Status status;

	@Enumerated(EnumType.STRING)
	@Column(name = "evaluation_status", length = 24)
	private EvaluationStatus evaluationStatus;

	@Column(name = "evaluated_session_id")
	private UUID evaluatedSessionId;

	@Column(name = "evaluation_json", columnDefinition = "TEXT")
	private String evaluationJson;

	@Column(name = "activated_at", nullable = false)
	private Instant activatedAt;

	@Column(name = "evaluated_at")
	private Instant evaluatedAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected TrainingCoachingTask() {
	}

	TrainingCoachingTask(UUID userId, String trainingId, UUID sourceAnalysisCallId,
			String sourceDataVersion, String configurationKey, int modeVersion,
			int scoringVersion, String title, String description, String targetsJson,
			Instant activatedAt) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.trainingId = trainingId;
		this.sourceAnalysisCallId = sourceAnalysisCallId;
		this.sourceDataVersion = sourceDataVersion;
		this.configurationKey = configurationKey;
		this.modeVersion = modeVersion;
		this.scoringVersion = scoringVersion;
		this.title = title;
		this.description = description;
		this.targetsJson = targetsJson;
		this.maxAttempts = 3;
		this.requiredPasses = 2;
		this.attemptsJson = "[]";
		this.status = Status.ACTIVE;
		this.activatedAt = activatedAt;
		this.updatedAt = activatedAt;
	}

	void cancel(Instant cancelledAt) {
		if (status != Status.ACTIVE) return;
		status = Status.CANCELLED;
		updatedAt = cancelledAt;
	}

	void complete(EvaluationStatus result, UUID sessionId, String serializedEvaluation,
			Instant completedAt) {
		if (status != Status.ACTIVE) {
			throw new IllegalStateException("only an active coaching task can be completed");
		}
		status = Status.COMPLETED;
		evaluationStatus = result;
		evaluatedSessionId = sessionId;
		evaluationJson = serializedEvaluation;
		evaluatedAt = completedAt;
		updatedAt = completedAt;
	}

	void recordAttempts(String serializedAttempts, Instant recordedAt) {
		if (status != Status.ACTIVE) {
			throw new IllegalStateException("only an active coaching task can record attempts");
		}
		attemptsJson = serializedAttempts;
		updatedAt = recordedAt;
	}

	UUID id() { return id; }
	UUID userId() { return userId; }
	String trainingId() { return trainingId; }
	UUID sourceAnalysisCallId() { return sourceAnalysisCallId; }
	String sourceDataVersion() { return sourceDataVersion; }
	String configurationKey() { return configurationKey; }
	int modeVersion() { return modeVersion; }
	int scoringVersion() { return scoringVersion; }
	String title() { return title; }
	String description() { return description; }
	String targetsJson() { return targetsJson; }
	int maxAttempts() { return maxAttempts; }
	int requiredPasses() { return requiredPasses; }
	String attemptsJson() { return attemptsJson; }
	Status status() { return status; }
	EvaluationStatus evaluationStatus() { return evaluationStatus; }
	UUID evaluatedSessionId() { return evaluatedSessionId; }
	String evaluationJson() { return evaluationJson; }
	Instant activatedAt() { return activatedAt; }
	Instant evaluatedAt() { return evaluatedAt; }
}
