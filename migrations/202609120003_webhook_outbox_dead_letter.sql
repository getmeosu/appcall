-- Stop permanently undeliverable webhook jobs from retrying forever. The
-- event payload and authenticated event history remain immutable; operators
-- can use the existing event replay route after correcting the connection.
ALTER TABLE webhook_outbox
    ADD COLUMN status text NOT NULL DEFAULT 'pending';
ALTER TABLE webhook_outbox
    ADD COLUMN last_error_code text NOT NULL DEFAULT '';
ALTER TABLE webhook_outbox
    ADD COLUMN dead_lettered_at timestamptz;

UPDATE webhook_outbox
SET status = 'dispatched'
WHERE dispatched_at IS NOT NULL;

-- Rows that exhausted the legacy retry budget must not receive one more
-- delivery attempt when the terminal status is introduced. Dispatched rows
-- are deliberately excluded so their history remains intact.
UPDATE webhook_outbox
SET status = 'dead_letter',
    last_error_code = 'RETRY_EXHAUSTED',
    dead_lettered_at = clock_timestamp(),
    next_attempt_at = clock_timestamp()
WHERE dispatched_at IS NULL
  AND attempts >= 10;

ALTER TABLE webhook_outbox
    ADD CONSTRAINT webhook_outbox_status_valid
    CHECK (status IN ('pending', 'dispatched', 'dead_letter'));
ALTER TABLE webhook_outbox
    ADD CONSTRAINT webhook_outbox_status_consistent
    CHECK (
        (status = 'pending' AND dispatched_at IS NULL AND dead_lettered_at IS NULL)
        OR (status = 'dispatched' AND dispatched_at IS NOT NULL AND dead_lettered_at IS NULL)
        OR (status = 'dead_letter' AND dispatched_at IS NULL AND dead_lettered_at IS NOT NULL)
    );

DROP INDEX IF EXISTS webhook_outbox_pending;
CREATE INDEX webhook_outbox_pending
    ON webhook_outbox(next_attempt_at)
    WHERE status = 'pending' AND dispatched_at IS NULL;
