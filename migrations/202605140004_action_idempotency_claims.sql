CREATE TABLE IF NOT EXISTS action_idempotency_claims (
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    idempotency_key text NOT NULL,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    action text NOT NULL,
    input_hash text NOT NULL,
    request_id text NOT NULL,
    leased_until timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_action_idempotency_claims_lease
    ON action_idempotency_claims(leased_until);
