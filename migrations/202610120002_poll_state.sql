-- OXIDE-POLL-1: opt-in polling of manifest sync operations that declare a
-- `poll` block. One subscription row per (project, connection, operation)
-- carries the schedule and the lease; the seen-item rows are the diff state.
-- The subscription row and every seen-item change commit in the same
-- transaction as the emitted events, so a crash before commit replays the
-- whole poll and a crash after commit replays nothing.
--
-- Every reset of a subscription's seen state (new subscription, input change,
-- rebind reseed, and later retention pruning) takes a fresh epoch from this
-- sequence. The epoch is part of each event's dedup key, so revisions that
-- restart after a reset can never collide with an earlier event's key, even
-- across unsubscribe and resubscribe (the sequence outlives the row).
CREATE SEQUENCE poll_subscription_epoch AS bigint;
CREATE TABLE poll_subscriptions (
    project_id text NOT NULL,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    operation text NOT NULL CHECK (operation <> '' AND length(operation) <= 256),
    input jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(input) = 'object'),
    -- Seen state belongs to the provider identity generation that observed it;
    -- a rebind resets it and the next run seeds again without emitting.
    connection_generation bigint NOT NULL CHECK (connection_generation > 0),
    epoch bigint NOT NULL DEFAULT nextval('poll_subscription_epoch'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    seeded boolean NOT NULL DEFAULT false,
    next_run_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    worker_id text NOT NULL DEFAULT '',
    leased_until timestamptz,
    last_error text NOT NULL DEFAULT '' CHECK (length(last_error) <= 256),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, connection_id, operation),
    CHECK ((worker_id = '') = (leased_until IS NULL))
);
CREATE INDEX poll_subscriptions_due
    ON poll_subscriptions (next_run_at)
    WHERE status = 'active';

CREATE TABLE poll_seen_items (
    project_id text NOT NULL,
    connection_id text NOT NULL,
    operation text NOT NULL,
    item_key text NOT NULL CHECK (item_key <> '' AND length(item_key) <= 1024),
    -- sha256 hex of the version value (or canonical item JSON).
    fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    -- Advances by one per observed change; part of the event dedup key so an
    -- A -> B -> A flip emits three distinct events, each exactly once.
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    changed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, connection_id, operation, item_key),
    FOREIGN KEY (project_id, connection_id, operation)
        REFERENCES poll_subscriptions (project_id, connection_id, operation)
        ON DELETE CASCADE
);

-- Trigger names an event satisfies. POLL-1 owns this column with OXIDE-WH-1's
-- definition (WH-1 stacks on POLL-1 and drops its own migration): non-null,
-- empty for events without trigger tagging, GIN-indexed for single-trigger
-- filtering. IF NOT EXISTS keeps both statements idempotent.
ALTER TABLE webhook_events
    ADD COLUMN IF NOT EXISTS triggers text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS webhook_events_triggers_idx
    ON webhook_events USING gin (triggers);
