CREATE TABLE ai_provider_settings (
    id INTEGER PRIMARY KEY,
    provider_id VARCHAR(32) NOT NULL,
    api_key_ciphertext VARCHAR(1024) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_ai_provider_settings_singleton CHECK (id = 1)
);

