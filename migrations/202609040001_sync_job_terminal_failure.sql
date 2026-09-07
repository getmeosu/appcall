-- Terminal failure state for sync jobs.
--
-- Before this, `attempts` was the only failure signal and nothing ever set a
-- job to a state that stops it being claimed: a job whose connection had its
-- credential revoked retried forever, and an operator inspecting the queue
-- could not tell it apart from one merely waiting its turn.
--
-- last_error carries the reason so triage starts at the queue rather than at
-- correlated worker logs. It is additive with a default, so a rollout where the
-- old binary still writes to this table is safe: the old code never names the
-- column and the default fills it.
ALTER TABLE sync_jobs
    ADD COLUMN IF NOT EXISTS last_error text NOT NULL DEFAULT '';

-- The claim query filters on status = 'pending', so 'failed' rows drop out of
-- the working set for free. This partial index keeps the operator-facing
-- "what died" query off a sequential scan as the table grows, without adding
-- write cost to the healthy path.
CREATE INDEX IF NOT EXISTS idx_sync_jobs_failed
    ON sync_jobs (project_id, updated_at DESC)
    WHERE status = 'failed';
