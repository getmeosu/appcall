-- Per-account LinkedIn action-safety counters. End users connect their REAL
-- LinkedIn accounts through Unipile; LinkedIn restricts/bans accounts whose
-- automation looks non-human. The control plane enforces conservative
-- per-account ceilings (see internal/actions/linkedin_limits.go) via an ATOMIC,
-- all-or-nothing compare-and-increment across the hour/day/week windows, so two
-- concurrent runs can NEVER jointly push an account past a cap of N.
--
-- Keyed at project + per-brand (external_account_id) + action_class + window so
-- each LinkedIn action type (invitation / profile_view / search) is metered
-- independently and the high-risk weekly invitation ceiling is tracked on its own
-- rolling-week bucket. external_account_id is the empty string for project-wide
-- (admin/platform) traffic so every action buckets deterministically.
--
-- window_kind is 'hour' | 'day' | 'week'; window_key buckets the counter
-- (UTC: e.g. 2026-06-08T14, 2026-06-08, 2026-W23). A new window starts a fresh
-- row, so old rows are inert and may be pruned out of band. last_sent_at backs
-- the per-class minimum-spacing (anti-velocity) check.
CREATE TABLE IF NOT EXISTS linkedin_action_counters (
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    external_account_id text NOT NULL DEFAULT '',
    action_class text NOT NULL,
    window_kind text NOT NULL,
    window_key text NOT NULL,
    count bigint NOT NULL DEFAULT 0,
    last_sent_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, external_account_id, action_class, window_kind, window_key)
);
