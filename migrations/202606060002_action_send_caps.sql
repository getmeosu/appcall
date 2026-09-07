-- Server-side outbound send-volume + daily-spend caps, enforced in the control
-- plane via an ATOMIC compare-and-increment (see ClaimActionSendCapacity). The
-- counter is keyed at project AND per-brand (external_account_id) granularity so
-- a cap of N can never be exceeded by concurrent runs: the conditional UPDATE is
-- a single statement, mirroring the idempotency-claim CAS.
--
-- external_account_id is part of the primary key and is the empty string for
-- project-wide (admin/platform) traffic, so every send buckets deterministically.
-- window_key buckets the counter (the UTC day for daily caps); a new day starts a
-- fresh row, so old rows are inert and may be pruned out of band.
CREATE TABLE IF NOT EXISTS action_send_caps (
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_account_id text NOT NULL DEFAULT '',
    window_key text NOT NULL,
    send_count bigint NOT NULL DEFAULT 0,
    spend_micros bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, external_account_id, window_key)
);
