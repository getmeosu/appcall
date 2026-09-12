-- Durable identity and audit boundaries for action-claim inspection and
-- operator reconciliation. Values are metadata only; provider credentials and
-- raw action payloads are never copied into these tables.
ALTER TABLE action_idempotency_claims
    -- Existing claims predate immutable account binding. NULL means that the
    -- original owner cannot be proven and must remain non-reconcilable.
    ADD COLUMN IF NOT EXISTS external_account_id text,
    -- Connector is also immutable request metadata. Legacy rows remain NULL
    -- unless a matching historical action log can prove the value.
    ADD COLUMN IF NOT EXISTS connector text;

-- A request can have more than one historical log row. Backfill only when
-- every matching log agrees on both immutable values; otherwise leave NULL so
-- reconciliation cannot infer ownership from an ambiguous history.
WITH proven_logs AS (
    SELECT
        project_id,
        request_id,
        connection_id,
        action,
        min(connector) AS connector,
        min(external_account_id) AS external_account_id
    FROM action_logs
    WHERE request_id IS NOT NULL
    GROUP BY project_id, request_id, connection_id, action
    HAVING bool_and(COALESCE(connector <> '', false))
       AND bool_and(COALESCE(external_account_id <> '', false))
       AND count(*) = count(connector)
       AND count(*) = count(external_account_id)
       AND count(DISTINCT connector) = 1
       AND count(DISTINCT external_account_id) = 1
)
UPDATE action_idempotency_claims AS claims
SET connector = COALESCE(claims.connector, proven_logs.connector),
    external_account_id = COALESCE(claims.external_account_id, proven_logs.external_account_id)
FROM proven_logs
WHERE claims.project_id = proven_logs.project_id
  AND claims.request_id = proven_logs.request_id
  AND claims.connection_id = proven_logs.connection_id
  AND claims.action = proven_logs.action
  AND (claims.connector IS NULL OR claims.external_account_id IS NULL);

ALTER TABLE action_usage_reservations
    -- Legacy reservations have no request identity. New reservations bind all
    -- three values before the dispatch fence is marked.
    ADD COLUMN IF NOT EXISTS idempotency_key text,
    ADD COLUMN IF NOT EXISTS request_id text,
    ADD COLUMN IF NOT EXISTS input_hash text;

CREATE INDEX IF NOT EXISTS idx_action_claims_scope
    ON action_idempotency_claims(project_id, connection_id, external_account_id, created_at);

CREATE INDEX IF NOT EXISTS idx_action_usage_reservations_claim
    ON action_usage_reservations(project_id, idempotency_key, request_id)
    WHERE state IN ('pending', 'dispatched');

-- One row per counter window charged by one reservation. Keeping the original
-- UTC window here makes a later proven-nondispatch refund safe across a day or
-- month boundary and lets the refund transition be exactly once.
CREATE TABLE IF NOT EXISTS action_usage_reservation_charges (
    reservation_id text NOT NULL REFERENCES action_usage_reservations(id) ON DELETE CASCADE,
    charge_kind text NOT NULL CHECK (charge_kind IN ('send', 'linkedin')),
    action_class text NOT NULL DEFAULT '',
    window_kind text NOT NULL,
    window_key text NOT NULL,
    quantity bigint NOT NULL DEFAULT 1 CHECK (quantity > 0),
    spend_micros bigint NOT NULL DEFAULT 0 CHECK (spend_micros >= 0),
    refunded_at timestamptz,
    PRIMARY KEY (reservation_id, charge_kind, action_class, window_kind, window_key)
);

CREATE TABLE IF NOT EXISTS action_claim_reconciliation_audits (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    request_id text NOT NULL,
    connection_id text NOT NULL,
    external_account_id text NOT NULL DEFAULT '',
    connector text NOT NULL,
    action text NOT NULL,
    input_hash text NOT NULL,
    resolution text NOT NULL CHECK (resolution IN ('proven_not_dispatched', 'provider_outcome_known')),
    provider_succeeded boolean,
    actor_id text NOT NULL,
    evidence_ref text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT action_claim_reconciliation_outcome_shape CHECK (
        (resolution = 'proven_not_dispatched' AND provider_succeeded IS NULL)
        OR (resolution = 'provider_outcome_known' AND provider_succeeded IS NOT NULL)
    ),
    CONSTRAINT action_claim_reconciliation_metadata_bounds CHECK (
        length(id) BETWEEN 1 AND 128
        AND length(actor_id) BETWEEN 1 AND 128
        AND length(evidence_ref) BETWEEN 1 AND 256
    ),
    UNIQUE (project_id, idempotency_key, id)
);

CREATE INDEX IF NOT EXISTS idx_action_claim_reconciliation_project
    ON action_claim_reconciliation_audits(project_id, created_at, id);
