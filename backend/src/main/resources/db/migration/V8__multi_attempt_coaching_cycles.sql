ALTER TABLE training_coaching_tasks
    ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;

ALTER TABLE training_coaching_tasks
    ADD COLUMN required_passes INTEGER NOT NULL DEFAULT 2;

ALTER TABLE training_coaching_tasks
    ADD COLUMN attempts_json TEXT NOT NULL DEFAULT '[]';

UPDATE training_coaching_tasks
SET max_attempts = 1,
    required_passes = 1
WHERE status = 'COMPLETED';
