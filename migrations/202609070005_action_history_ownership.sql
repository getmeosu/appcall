-- Preserve the authenticated brand at execution time, including actions using
-- platform-owned connections. Existing rows have unknown provenance.
ALTER TABLE action_logs ADD COLUMN IF NOT EXISTS external_account_id text NOT NULL DEFAULT '';
ALTER TABLE action_replay_logs ADD COLUMN IF NOT EXISTS external_account_id text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_action_logs_brand ON action_logs(project_id, external_account_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_action_replay_logs_brand ON action_replay_logs(project_id, external_account_id, created_at, id);
