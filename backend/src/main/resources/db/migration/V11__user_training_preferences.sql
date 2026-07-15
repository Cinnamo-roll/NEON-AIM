CREATE TABLE user_training_preferences (
    user_id UUID PRIMARY KEY,
    preferences_json TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_user_training_preferences_user
        FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE
);
