-- Add a per-channel binding dimension so one brand can link a distinct provider
-- account per Unipile channel family (LINKEDIN, MAIL, MESSAGING, ...). The column
-- is NOT NULL DEFAULT '' so the existing UNIQUE(project_id, connector,
-- provider_account_id) stays valid and legacy non-unipile rows simply carry
-- channel=''.
ALTER TABLE provider_subaccounts
    ADD COLUMN channel text NOT NULL DEFAULT '';

-- Per-(brand, channel) uniqueness is a DB-level invariant, not merely a service
-- convention: it is the race-safety net behind the entitlement gate (GATE #2).
-- Two concurrent captures that both pass the cap check cannot both persist — the
-- second INSERT collides on this constraint, and the atomic Link upsert
-- (INSERT ... ON CONFLICT DO UPDATE) turns reconnect into a single statement so a
-- brand never accrues duplicate rows for the same channel.
ALTER TABLE provider_subaccounts
    ADD CONSTRAINT uq_subaccount_brand_channel
    UNIQUE (project_id, external_account_id, connector, channel);

-- The unique constraint above already provides the (project_id,
-- external_account_id, connector, channel) lookup index, so the prior partial
-- index is redundant; drop it.
DROP INDEX IF EXISTS idx_provider_subaccounts_brand;
