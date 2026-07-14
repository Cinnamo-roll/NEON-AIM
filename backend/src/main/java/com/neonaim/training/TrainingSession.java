package com.neonaim.training;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "training_sessions")
class TrainingSession {

	enum IntegrityStatus { VALID, INVALID }

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "client_session_id", nullable = false, length = 64)
	private String clientSessionId;

	@Column(name = "training_id", nullable = false, length = 64)
	private String trainingId;

	@Column(name = "mode_version", nullable = false)
	private int modeVersion;

	@Column(name = "scoring_version", nullable = false)
	private int scoringVersion;

	@Column(name = "configuration_key", nullable = false, length = 160)
	private String configurationKey;

	@Column(name = "session_type", nullable = false, length = 16)
	private String sessionType;

	@Column(name = "started_at", nullable = false)
	private Instant startedAt;

	@Column(name = "completed_at", nullable = false)
	private Instant completedAt;

	@Column(name = "duration_ms", nullable = false)
	private long durationMs;

	@Column(nullable = false)
	private double score;

	@Column(nullable = false)
	private int hits;

	@Column(nullable = false)
	private int misses;

	@Column(nullable = false)
	private double accuracy;

	@Column(name = "targets_per_minute", nullable = false)
	private double targetsPerMinute;

	@Column(name = "average_hit_interval", nullable = false)
	private double averageHitInterval;

	@Column(name = "consistency_score", nullable = false)
	private double consistencyScore;

	@Column(name = "max_combo", nullable = false)
	private int maxCombo;

	@Column(nullable = false, length = 16)
	private String grade;

	@Enumerated(EnumType.STRING)
	@Column(name = "integrity_status", nullable = false, length = 16)
	private IntegrityStatus integrityStatus;

	@Column(name = "integrity_errors_json", nullable = false, columnDefinition = "TEXT")
	private String integrityErrorsJson;

	@Column(name = "configuration_json", nullable = false, columnDefinition = "TEXT")
	private String configurationJson;

	@Column(name = "detail_json", nullable = false, columnDefinition = "TEXT")
	private String detailJson;

	@Column(name = "analysis_snapshot_json", nullable = false, columnDefinition = "TEXT")
	private String analysisSnapshotJson;

	@Column(name = "analysis_data_version", nullable = false, length = 64)
	private String analysisDataVersion;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected TrainingSession() {
	}

	TrainingSession(UUID userId, TrainingSessionSubmission submission, StoredJson storedJson, Instant createdAt) {
		TrainingSessionSubmission.Summary summary = submission.summary();
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.clientSessionId = submission.clientSessionId();
		this.trainingId = submission.trainingId();
		this.modeVersion = submission.modeVersion();
		this.scoringVersion = submission.scoringVersion();
		this.configurationKey = submission.configurationKey();
		this.sessionType = submission.sessionType();
		this.startedAt = submission.startedAt();
		this.completedAt = submission.completedAt();
		this.durationMs = submission.durationMs();
		this.score = summary.score();
		this.hits = summary.hits();
		this.misses = summary.misses();
		this.accuracy = summary.accuracy();
		this.targetsPerMinute = summary.targetsPerMinute();
		this.averageHitInterval = summary.averageHitInterval();
		this.consistencyScore = summary.consistencyScore();
		this.maxCombo = summary.maxCombo();
		this.grade = summary.grade();
		this.integrityStatus = submission.integrity().passed() ? IntegrityStatus.VALID : IntegrityStatus.INVALID;
		this.integrityErrorsJson = storedJson.integrityErrors();
		this.configurationJson = storedJson.configuration();
		this.detailJson = storedJson.detail();
		this.analysisSnapshotJson = storedJson.analysisSnapshot();
		this.analysisDataVersion = storedJson.analysisDataVersion();
		this.createdAt = createdAt;
	}

	UUID id() { return id; }
	UUID userId() { return userId; }
	String clientSessionId() { return clientSessionId; }
	String trainingId() { return trainingId; }
	int modeVersion() { return modeVersion; }
	int scoringVersion() { return scoringVersion; }
	String configurationKey() { return configurationKey; }
	String sessionType() { return sessionType; }
	Instant startedAt() { return startedAt; }
	Instant completedAt() { return completedAt; }
	long durationMs() { return durationMs; }
	double score() { return score; }
	int hits() { return hits; }
	int misses() { return misses; }
	double accuracy() { return accuracy; }
	double targetsPerMinute() { return targetsPerMinute; }
	double averageHitInterval() { return averageHitInterval; }
	double consistencyScore() { return consistencyScore; }
	int maxCombo() { return maxCombo; }
	String grade() { return grade; }
	IntegrityStatus integrityStatus() { return integrityStatus; }
	String integrityErrorsJson() { return integrityErrorsJson; }
	String configurationJson() { return configurationJson; }
	String detailJson() { return detailJson; }
	String analysisSnapshotJson() { return analysisSnapshotJson; }
	String analysisDataVersion() { return analysisDataVersion; }
	Instant createdAt() { return createdAt; }

	record StoredJson(String configuration, String detail, String analysisSnapshot,
			String integrityErrors, String analysisDataVersion) {
	}
}
