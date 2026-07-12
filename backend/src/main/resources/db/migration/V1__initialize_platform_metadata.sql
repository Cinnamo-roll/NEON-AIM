CREATE TABLE platform_metadata (
    metadata_key VARCHAR(64) PRIMARY KEY,
    metadata_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_metadata (metadata_key, metadata_value)
VALUES ('schema_owner', 'neon-aim-backend');
