ALTER TABLE training_sessions
    ADD COLUMN session_type VARCHAR(16);

UPDATE training_sessions
SET session_type = CASE
    WHEN training_id = 'grid-shot'
        AND configuration_key = 'grid-shot:60s:medium'
        AND mode_version = 1
        AND scoring_version = 1
    THEN 'benchmark'
    ELSE 'practice'
END;

ALTER TABLE training_sessions
    ALTER COLUMN session_type SET NOT NULL;

ALTER TABLE training_sessions
    ADD CONSTRAINT ck_training_sessions_type
    CHECK (session_type IN ('benchmark', 'practice'));
