CREATE TABLE training_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    client_session_id VARCHAR(64) NOT NULL,
    training_id VARCHAR(64) NOT NULL,
    mode_version INTEGER NOT NULL,
    scoring_version INTEGER NOT NULL,
    configuration_key VARCHAR(160) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_ms BIGINT NOT NULL,
    score DOUBLE PRECISION NOT NULL,
    hits INTEGER NOT NULL,
    misses INTEGER NOT NULL,
    accuracy DOUBLE PRECISION NOT NULL,
    targets_per_minute DOUBLE PRECISION NOT NULL,
    average_hit_interval DOUBLE PRECISION NOT NULL,
    consistency_score DOUBLE PRECISION NOT NULL,
    max_combo INTEGER NOT NULL,
    grade VARCHAR(16) NOT NULL,
    integrity_status VARCHAR(16) NOT NULL,
    integrity_errors_json TEXT NOT NULL,
    configuration_json TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    analysis_snapshot_json TEXT NOT NULL,
    analysis_data_version VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_training_sessions_user FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT uq_training_sessions_user_client UNIQUE (user_id, client_session_id),
    CONSTRAINT ck_training_sessions_duration CHECK (duration_ms > 0),
    CONSTRAINT ck_training_sessions_accuracy CHECK (accuracy >= 0 AND accuracy <= 100),
    CONSTRAINT ck_training_sessions_consistency CHECK (consistency_score >= 0 AND consistency_score <= 100)
);

CREATE INDEX idx_training_sessions_user_completed
    ON training_sessions (user_id, completed_at DESC);

CREATE INDEX idx_training_sessions_user_training_completed
    ON training_sessions (user_id, training_id, completed_at DESC);
