CREATE TABLE user_accounts (
    id UUID PRIMARY KEY,
    username VARCHAR(20) NOT NULL,
    username_normalized VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(254) NOT NULL,
    email_normalized VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(24) NOT NULL,
    bio VARCHAR(160) NOT NULL DEFAULT '',
    avatar_preset VARCHAR(20) NOT NULL DEFAULT 'pulse',
    accent_color VARCHAR(20) NOT NULL DEFAULT 'cyan',
    preferred_game VARCHAR(32),
    region_code VARCHAR(16),
    profile_visibility VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
    role VARCHAR(16) NOT NULL DEFAULT 'USER',
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_user_accounts_status ON user_accounts (status);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    replaced_by_token_id UUID,
    user_agent VARCHAR(255),
    ip_address VARCHAR(64),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES user_accounts (id),
    CONSTRAINT fk_refresh_tokens_replacement FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens (id)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens (expires_at);
