-- Preserve the parser's existing provider idempotency key separately from the
-- public event resource ID. Existing IDs are retained so historical URLs and
-- outbox foreign keys remain valid while new deliveries can be scoped to their
-- owning connection.
ALTER TABLE webhook_events ADD COLUMN provider_event_key text;

UPDATE webhook_events
SET provider_event_key = id
WHERE provider_event_key IS NULL;

CREATE UNIQUE INDEX webhook_events_provider_event_identity
    ON webhook_events(project_id, connector, connection_id, provider_event_key)
    WHERE provider_event_key IS NOT NULL AND provider_event_key <> '';
