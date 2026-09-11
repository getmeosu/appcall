-- A connection revision is a durable generation fence for work that crosses
-- an external provider boundary. Existing rows start in generation one.
ALTER TABLE connections
    ADD COLUMN connection_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE connections
    ADD CONSTRAINT connections_connection_revision_positive
    CHECK (connection_revision > 0);

ALTER TABLE webhook_events
    ADD COLUMN connection_revision bigint;
UPDATE webhook_events AS e
SET connection_revision = COALESCE(c.connection_revision, 1)
FROM connections AS c
WHERE c.project_id = e.project_id
  AND c.id = e.connection_id;
UPDATE webhook_events
SET connection_revision = 1
WHERE connection_revision IS NULL;
ALTER TABLE webhook_events
    ALTER COLUMN connection_revision SET DEFAULT 1;
ALTER TABLE webhook_events
    ALTER COLUMN connection_revision SET NOT NULL;
ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_connection_revision_positive
    CHECK (connection_revision > 0);

DROP INDEX IF EXISTS webhook_events_provider_event_identity;
CREATE UNIQUE INDEX webhook_events_provider_event_revision_identity
    ON webhook_events(
        project_id,
        connector,
        connection_id,
        connection_revision,
        provider_event_key
    )
    WHERE provider_event_key IS NOT NULL AND provider_event_key <> '';

-- Increment once for every connection-row update. This deliberately covers
-- status, credentials, test status, and stale-authorizing cleanup without
-- relying on every writer remembering to maintain the fence.
CREATE OR REPLACE FUNCTION appcall_bump_connection_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.connection_revision := OLD.connection_revision + 1;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS connections_connection_revision ON connections;
CREATE TRIGGER connections_connection_revision
    BEFORE UPDATE ON connections
    FOR EACH ROW
    EXECUTE FUNCTION appcall_bump_connection_revision();
