CREATE TABLE training_session_analyses (
    session_id UUID PRIMARY KEY,
    status VARCHAR(16) NOT NULL,
    source VARCHAR(16) NOT NULL,
    engine_version VARCHAR(80) NOT NULL,
    provider_id VARCHAR(80),
    model_name VARCHAR(120),
    prompt_version VARCHAR(80),
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_training_session_analyses_session
        FOREIGN KEY (session_id) REFERENCES training_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_training_session_analyses_input_tokens CHECK (input_tokens >= 0),
    CONSTRAINT ck_training_session_analyses_output_tokens CHECK (output_tokens >= 0)
);

CREATE INDEX idx_training_session_analyses_status_updated
    ON training_session_analyses (status, updated_at DESC);
