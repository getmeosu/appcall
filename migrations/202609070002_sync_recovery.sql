-- Recovery checkpoints are per job; terminal jobs cannot leak cursors into a new sync.
ALTER TABLE sync_jobs ADD COLUMN dedup_key text;
UPDATE sync_jobs SET dedup_key = id;
ALTER TABLE sync_jobs ALTER COLUMN dedup_key SET NOT NULL;
ALTER TABLE sync_jobs ADD UNIQUE (project_id, dedup_key);
CREATE TABLE sync_job_checkpoints (
 job_id text PRIMARY KEY REFERENCES sync_jobs(id) ON DELETE CASCADE,
 cursor text NOT NULL
);
CREATE TABLE sync_job_cursor_visits (
 job_id text NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
 cursor text NOT NULL,
 PRIMARY KEY (job_id, cursor)
);
-- Preserve checkpoints for existing unfinished jobs when upgrading.
INSERT INTO sync_job_checkpoints SELECT j.id, c.cursor FROM sync_jobs j
JOIN sync_cursors c ON c.connection_id=j.connection_id AND c.operation=j.operation
WHERE j.status IN ('pending', 'running');
ALTER TABLE synced_messages DROP CONSTRAINT synced_messages_pkey;
ALTER TABLE synced_messages ADD PRIMARY KEY (project_id, connection_id, id);
CREATE INDEX sync_jobs_recovery ON sync_jobs (leased_until) WHERE status = 'running';

ALTER TABLE sync_jobs ADD COLUMN input jsonb NOT NULL DEFAULT '{}';
