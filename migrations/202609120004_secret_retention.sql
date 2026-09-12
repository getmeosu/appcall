-- Keep the exact encrypted PKCE envelope reachable from an authorization intent.
-- Older rows are still protected by the conservative kind-based fallback in
-- appcall-store while their authorization intent remains unresolved.
ALTER TABLE oauth_refresh_intents
    ADD COLUMN IF NOT EXISTS pkce_secret_ref_id text;

-- A completed authorization no longer needs its one-time verifier. Clear any
-- values written by an earlier rollout before installing the restrictive FK;
-- unknown and in-flight intents remain untouched and continue to protect the
-- verifier from collection.
UPDATE oauth_refresh_intents
SET pkce_secret_ref_id = NULL
WHERE state = 'completed'
  AND pkce_secret_ref_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'oauth_refresh_intents'::regclass
          AND conname = 'oauth_refresh_intents_pkce_secret_ref_id_fkey'
    ) THEN
        ALTER TABLE oauth_refresh_intents
            ADD CONSTRAINT oauth_refresh_intents_pkce_secret_ref_id_fkey
            FOREIGN KEY (pkce_secret_ref_id)
            REFERENCES secret_envelopes(id)
            ON DELETE RESTRICT;
    END IF;
END
$$;

-- Credential references must fail the cleanup rather than silently becoming
-- NULL. The store also takes a key-share lock before assigning a reference so
-- cleanup and a concurrent writer have a deterministic skip/fail boundary.
ALTER TABLE connections
    DROP CONSTRAINT IF EXISTS connections_secret_ref_id_fkey;
ALTER TABLE connections
    ADD CONSTRAINT connections_secret_ref_id_fkey
    FOREIGN KEY (secret_ref_id)
    REFERENCES secret_envelopes(id)
    ON DELETE RESTRICT;

ALTER TABLE provider_subaccounts
    DROP CONSTRAINT IF EXISTS provider_subaccounts_secret_ref_id_fkey;
ALTER TABLE provider_subaccounts
    ADD CONSTRAINT provider_subaccounts_secret_ref_id_fkey
    FOREIGN KEY (secret_ref_id)
    REFERENCES secret_envelopes(id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_secret_envelopes_gc_age
    ON secret_envelopes(created_at, id);
CREATE INDEX IF NOT EXISTS idx_connections_secret_ref_id
    ON connections(secret_ref_id)
    WHERE secret_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_subaccounts_secret_ref_id
    ON provider_subaccounts(secret_ref_id)
    WHERE secret_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_intents_secret_ref_id
    ON oauth_refresh_intents(secret_ref_id)
    WHERE secret_ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_intents_pkce_secret_ref_id
    ON oauth_refresh_intents(pkce_secret_ref_id)
    WHERE pkce_secret_ref_id IS NOT NULL;
