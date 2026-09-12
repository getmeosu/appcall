-- Keep the row mutation fence separate from the provider identity generation.
-- connection_revision changes for every row update; this generation changes
-- only when the connection is rebound or truly re-established.
ALTER TABLE connections
    ADD COLUMN connection_generation bigint NOT NULL DEFAULT 1;
ALTER TABLE connections
    ADD CONSTRAINT connections_connection_generation_positive
    CHECK (connection_generation > 0);

ALTER TABLE webhook_events
    ADD COLUMN connection_generation bigint;
ALTER TABLE webhook_events
    ADD CONSTRAINT webhook_events_connection_generation_positive
    CHECK (connection_generation IS NULL OR connection_generation > 0);

-- Rows written before this migration may contain the same provider key more
-- than once because the old identity included connection_revision. Preserve
-- every event and its outbox row, but retain one deterministic canonical
-- identity for future redelivery deduplication. The other historical rows are
-- intentionally left NULL and remain visible in event history.
WITH ranked AS (
    SELECT
        e.project_id,
        e.id,
        (
            c.id IS NOT NULL
            AND e.external_account_id = COALESCE(c.external_account_id, '')
        ) AS matches_current,
        row_number() OVER (
            PARTITION BY e.project_id, e.connector, e.connection_id, e.provider_event_key
            -- We cannot reconstruct every pre-migration lifecycle from the
            -- old row fence. Prefer the row that belongs to the connection's
            -- current account, then use a stable historical ordering. This
            -- keeps a reassigned connection's current-scope redelivery from
            -- conflicting with an older account while preserving every row.
            ORDER BY (
                c.id IS NOT NULL
                AND e.external_account_id = COALESCE(c.external_account_id, '')
            ) DESC, e.created_at, e.id
        ) AS rank
    FROM webhook_events AS e
    LEFT JOIN connections AS c
      ON c.project_id = e.project_id
     AND c.id = e.connection_id
     AND c.connector = e.connector
    WHERE e.provider_event_key IS NOT NULL
      AND e.provider_event_key <> ''
)
UPDATE webhook_events AS e
SET connection_generation = 1
FROM ranked
WHERE ranked.rank = 1
  AND ranked.matches_current
  AND ranked.project_id = e.project_id
  AND ranked.id = e.id;

ALTER TABLE webhook_events
    ALTER COLUMN connection_generation SET DEFAULT 1;

DROP INDEX IF EXISTS webhook_events_provider_event_revision_identity;
CREATE UNIQUE INDEX webhook_events_provider_event_generation_identity
    ON webhook_events(
        project_id,
        connector,
        connection_id,
        connection_generation,
        provider_event_key
    )
    WHERE provider_event_key IS NOT NULL
      AND provider_event_key <> ''
      AND connection_generation IS NOT NULL;

CREATE OR REPLACE FUNCTION appcall_bump_connection_generation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    refresh_in_flight boolean := false;
BEGIN
    -- Older isolated schemas can apply this migration before the OAuth intent
    -- table. Dynamic SQL keeps the trigger compatible with those schemas;
    -- production applies the intent migration first.
    IF OLD.status = 'degraded'
       AND NEW.status = 'active'
       AND to_regclass('oauth_refresh_intents') IS NOT NULL
    THEN
        EXECUTE $sql$
            SELECT EXISTS (
                SELECT 1
                FROM oauth_refresh_intents
                WHERE project_id = $1
                  AND connection_id = $2
                  AND operation = 'refresh'
                  AND state IN ('dispatched', 'unknown')
                  -- A stale intent for an earlier credential must not hide a
                  -- genuine manual credential replacement.
                  AND secret_ref_id IS NOT DISTINCT FROM $3::text
            )
        $sql$
        INTO refresh_in_flight
        USING NEW.project_id, NEW.id, OLD.secret_ref_id;
    END IF;

    IF OLD.external_account_id IS DISTINCT FROM NEW.external_account_id
       OR OLD.credential_owner IS DISTINCT FROM NEW.credential_owner
       OR OLD.connector IS DISTINCT FROM NEW.connector
       OR OLD.auth_type IS DISTINCT FROM NEW.auth_type
       OR (
           OLD.secret_ref_id IS DISTINCT FROM NEW.secret_ref_id
           AND NOT refresh_in_flight
       )
       OR (
           OLD.status IS DISTINCT FROM NEW.status
           AND NEW.status = 'active'
           AND NOT refresh_in_flight
       )
    THEN
        NEW.connection_generation := OLD.connection_generation + 1;
    ELSE
        NEW.connection_generation := OLD.connection_generation;
    END IF;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS connections_connection_generation ON connections;
CREATE TRIGGER connections_connection_generation
    BEFORE UPDATE ON connections
    FOR EACH ROW
    EXECUTE FUNCTION appcall_bump_connection_generation();
