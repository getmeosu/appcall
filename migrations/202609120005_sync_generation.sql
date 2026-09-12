-- Bind durable sync state to the provider identity generation that created it.
-- A managed OAuth refresh keeps this value stable; a reconnect or account
-- replacement advances it and makes unfinished work stale.
ALTER TABLE sync_jobs
    ADD COLUMN connection_generation bigint;

UPDATE sync_jobs AS j
SET connection_generation = c.connection_generation
FROM connections AS c
WHERE c.project_id = j.project_id
  AND c.id = j.connection_id;

UPDATE sync_jobs
SET connection_generation = 1
WHERE connection_generation IS NULL;

ALTER TABLE sync_jobs
    ALTER COLUMN connection_generation SET DEFAULT 1,
    ALTER COLUMN connection_generation SET NOT NULL;
ALTER TABLE sync_jobs
    ADD CONSTRAINT sync_jobs_connection_generation_positive
    CHECK (connection_generation > 0);

ALTER TABLE sync_job_checkpoints
    ADD COLUMN connection_generation bigint;

-- A running job or a pending job with a checkpoint may have crossed a
-- connection rebind before this migration existed. Its cursor cannot be
-- proven to belong to the current provider identity, so cancel it and require
-- an explicit operator restart from the beginning.
CREATE TEMP TABLE appcall_legacy_sync_generation_reset
    ON COMMIT DROP
AS
SELECT j.id, c.connection_generation
FROM sync_jobs AS j
JOIN connections AS c
  ON c.project_id = j.project_id
 AND c.id = j.connection_id
LEFT JOIN sync_job_checkpoints AS cp
  ON cp.job_id = j.id
WHERE j.status = 'running'
   OR (j.status = 'pending' AND cp.job_id IS NOT NULL);

UPDATE sync_jobs AS j
SET status = 'cancelled',
    worker_id = '',
    leased_until = NULL,
    run_after = clock_timestamp(),
    last_error = 'connection generation unknown; restart required',
    connection_generation = reset.connection_generation,
    updated_at = clock_timestamp()
FROM appcall_legacy_sync_generation_reset AS reset
WHERE reset.id = j.id;

DELETE FROM sync_job_cursor_visits AS visits
USING appcall_legacy_sync_generation_reset AS reset
WHERE reset.id = visits.job_id;
DELETE FROM sync_job_checkpoints AS checkpoints
USING appcall_legacy_sync_generation_reset AS reset
WHERE reset.id = checkpoints.job_id;

DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname
    INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'sync_job_events'::regclass
      AND pg_get_constraintdef(oid) LIKE '%operator_cancelled%'
    LIMIT 1;
    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE sync_job_events DROP CONSTRAINT %I',
            constraint_name
        );
    END IF;
END
$$;

ALTER TABLE sync_job_events
    ADD CONSTRAINT sync_job_events_cancelled_reason
    CHECK (
        kind <> 'cancelled'
        OR COALESCE(detail->>'reason', '') IN (
            'operator_cancelled',
            'connection_generation_changed',
            'connection_generation_unknown'
        )
    );

INSERT INTO sync_job_events(job_id, seq, kind, detail)
SELECT reset.id,
       COALESCE((
           SELECT MAX(events.seq)
           FROM sync_job_events AS events
           WHERE events.job_id = reset.id
       ), 0) + 1,
       'cancelled',
       '{"reason":"connection_generation_unknown"}'::jsonb
FROM appcall_legacy_sync_generation_reset AS reset;

UPDATE sync_jobs AS j
SET connection_generation = c.connection_generation
FROM connections AS c
WHERE c.project_id = j.project_id
  AND c.id = j.connection_id
  AND j.connection_generation IS NULL;

UPDATE sync_job_checkpoints AS cp
SET connection_generation = j.connection_generation
FROM sync_jobs AS j
WHERE j.id = cp.job_id;

UPDATE sync_job_checkpoints
SET connection_generation = 1
WHERE connection_generation IS NULL;

ALTER TABLE sync_job_checkpoints
    ALTER COLUMN connection_generation SET DEFAULT 1,
    ALTER COLUMN connection_generation SET NOT NULL;
ALTER TABLE sync_job_checkpoints
    ADD CONSTRAINT sync_job_checkpoints_connection_generation_positive
    CHECK (connection_generation > 0);

-- Rows written before generation binding cannot be assigned safely after a
-- connection has been rebound. Keep them visible to internal repair tooling,
-- but exclude them from current-generation retrieval until a fresh sync writes
-- a bound row.
ALTER TABLE synced_messages
    ADD COLUMN connection_generation bigint;
ALTER TABLE synced_messages
    ADD CONSTRAINT synced_messages_connection_generation_positive
    CHECK (connection_generation IS NULL OR connection_generation > 0);

CREATE INDEX synced_messages_scope_order
    ON synced_messages(
        project_id,
        connection_id,
        connection_generation,
        created_at DESC,
        id DESC
    )
    WHERE connection_generation IS NOT NULL;

-- Stale-generation cancellation is a durable operator-visible lifecycle
-- transition, while preserving the existing event kind and history shape.
