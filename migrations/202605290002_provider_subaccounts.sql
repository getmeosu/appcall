CREATE TABLE IF NOT EXISTS provider_subaccounts (
    id                  text PRIMARY KEY,
    project_id          text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_account_id text NOT NULL,
    connector           text NOT NULL,
    provider_account_id text NOT NULL,
    status              text NOT NULL DEFAULT 'connected',
    secret_ref_id       text REFERENCES secret_envelopes(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, connector, provider_account_id),
    CONSTRAINT chk_subaccount_status CHECK (status IN ('connected','needs_reconnect'))
);

CREATE INDEX IF NOT EXISTS idx_provider_subaccounts_brand
    ON provider_subaccounts(project_id, external_account_id, connector);
