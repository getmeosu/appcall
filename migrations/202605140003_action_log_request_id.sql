ALTER TABLE action_logs
    ADD COLUMN IF NOT EXISTS request_id text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_action_logs_request_id
    ON action_logs(project_id, request_id);
