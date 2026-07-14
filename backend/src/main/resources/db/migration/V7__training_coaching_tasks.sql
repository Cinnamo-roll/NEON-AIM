CREATE TABLE training_coaching_tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    training_id VARCHAR(64) NOT NULL,
    source_analysis_call_id UUID NOT NULL,
    source_data_version VARCHAR(100) NOT NULL,
    configuration_key VARCHAR(160) NOT NULL,
    mode_version INTEGER NOT NULL,
    scoring_version INTEGER NOT NULL,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(600) NOT NULL,
    targets_json TEXT NOT NULL,
    status VARCHAR(16) NOT NULL,
    evaluation_status VARCHAR(24),
    evaluated_session_id UUID,
    evaluation_json TEXT,
    activated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_training_coaching_tasks_user
        FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_training_coaching_tasks_analysis
        FOREIGN KEY (source_analysis_call_id) REFERENCES training_career_ai_analysis_calls (id) ON DELETE CASCADE,
    CONSTRAINT fk_training_coaching_tasks_session
        FOREIGN KEY (evaluated_session_id) REFERENCES training_sessions (id) ON DELETE SET NULL
);

CREATE INDEX idx_training_coaching_user_training_activated
    ON training_coaching_tasks (user_id, training_id, activated_at DESC);

CREATE INDEX idx_training_coaching_active
    ON training_coaching_tasks (user_id, training_id, status);
