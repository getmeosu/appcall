ALTER TABLE connections
    ADD COLUMN IF NOT EXISTS external_account_id text,
    ADD COLUMN IF NOT EXISTS credential_owner    text NOT NULL DEFAULT 'brand';

ALTER TABLE connections
    ADD CONSTRAINT chk_connections_credential_owner
        CHECK (credential_owner IN ('platform','brand'));

CREATE INDEX IF NOT EXISTS idx_connections_brand
    ON connections(project_id, external_account_id, connector);
