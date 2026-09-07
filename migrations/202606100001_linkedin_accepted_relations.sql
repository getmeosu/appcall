-- Accepted LinkedIn connection invitations, fed by Unipile's USERS `new_relation`
-- webhook (LinkedIn gives no real-time signal, so this can arrive up to ~8h after
-- acceptance). The Sena desktop client cannot receive a push, so it PULLS new rows
-- by (project, external_account_id) ordered by accepted_at — this table is the
-- cheap, LinkedIn-API-free source of truth for "who accepted".
--
-- Keyed at project + per-brand (external_account_id) + the accepted account's
-- provider member id (the stable LinkedIn identity, same id used by the capture
-- dedupe path). A repeated webhook for the same relation is idempotent (UPSERT on
-- the PK leaves accepted_at at the first-seen time).
CREATE TABLE IF NOT EXISTS linkedin_accepted_relations (
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_account_id text NOT NULL DEFAULT '',
    provider_member_id text NOT NULL,
    accepted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, external_account_id, provider_member_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_accepted_relations_poll
    ON linkedin_accepted_relations (project_id, external_account_id, accepted_at);
