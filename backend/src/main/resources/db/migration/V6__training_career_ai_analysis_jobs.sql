CREATE TABLE training_career_ai_analysis_calls (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    anchor_session_id UUID NOT NULL,
    training_id VARCHAR(64) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    data_version VARCHAR(100) NOT NULL,
    status VARCHAR(24) NOT NULL,
    provider_id VARCHAR(160) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    prompt_version VARCHAR(80) NOT NULL,
    confidence VARCHAR(16) NOT NULL,
    sample_size INTEGER NOT NULL,
    comparable_sample_size INTEGER NOT NULL,
    configuration_count INTEGER NOT NULL,
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms BIGINT,
    failure_code VARCHAR(100),
    failure_message VARCHAR(400),
    result_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_training_career_ai_calls_user
        FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_training_career_ai_calls_session
        FOREIGN KEY (anchor_session_id) REFERENCES training_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_training_career_ai_sample_size CHECK (sample_size > 0),
    CONSTRAINT ck_training_career_ai_comparable_size CHECK (comparable_sample_size > 0),
    CONSTRAINT ck_training_career_ai_configuration_count CHECK (configuration_count > 0),
    CONSTRAINT ck_training_career_ai_input_tokens CHECK (input_tokens >= 0),
    CONSTRAINT ck_training_career_ai_output_tokens CHECK (output_tokens >= 0),
    CONSTRAINT ck_training_career_ai_duration CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX idx_training_career_ai_user_training_created
    ON training_career_ai_analysis_calls (user_id, training_id, created_at DESC);

CREATE INDEX idx_training_career_ai_status_created
    ON training_career_ai_analysis_calls (status, created_at DESC);
