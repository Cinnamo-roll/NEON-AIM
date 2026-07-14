CREATE TABLE training_ai_analysis_cache (
    cache_key VARCHAR(64) PRIMARY KEY,
    scope VARCHAR(16) NOT NULL,
    source_id VARCHAR(100) NOT NULL,
    data_version VARCHAR(100) NOT NULL,
    prompt_version VARCHAR(80) NOT NULL,
    provider_id VARCHAR(160) NOT NULL,
    result_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE training_ai_analysis_calls (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    session_id UUID NOT NULL,
    status VARCHAR(24) NOT NULL,
    provider_id VARCHAR(160) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    prompt_version VARCHAR(80) NOT NULL,
    data_version VARCHAR(100) NOT NULL,
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms BIGINT,
    failure_code VARCHAR(100),
    failure_message VARCHAR(400),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_training_ai_calls_user
        FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_training_ai_calls_session
        FOREIGN KEY (session_id) REFERENCES training_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_training_ai_calls_input_tokens CHECK (input_tokens >= 0),
    CONSTRAINT ck_training_ai_calls_output_tokens CHECK (output_tokens >= 0),
    CONSTRAINT ck_training_ai_calls_duration CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX idx_training_ai_calls_user_session_created
    ON training_ai_analysis_calls (user_id, session_id, created_at DESC);

CREATE INDEX idx_training_ai_calls_status_created
    ON training_ai_analysis_calls (status, created_at DESC);
