ALTER TABLE usage_events
    ADD COLUMN IF NOT EXISTS external_account_id text;

ALTER TABLE usage_monthly_rollups
    ADD COLUMN IF NOT EXISTS external_account_id text NOT NULL DEFAULT '';

ALTER TABLE usage_monthly_rollups DROP CONSTRAINT usage_monthly_rollups_pkey;
ALTER TABLE usage_monthly_rollups
    ADD PRIMARY KEY (project_id, external_account_id, month, kind);
