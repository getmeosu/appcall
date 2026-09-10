-- A pending lease is released when no dispatch occurs. A dispatched lease is
-- conservatively settled as one usage event after its recovery deadline so a
-- worker interruption cannot leave capacity active forever or double-charge.
CREATE TABLE IF NOT EXISTS action_usage_reservations (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    connection_id text NOT NULL,
    connector text NOT NULL,
    action text NOT NULL,
    external_account_id text NOT NULL DEFAULT '',
    state text NOT NULL CHECK (state IN ('pending', 'dispatched', 'settled', 'released')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    dispatched_at timestamptz,
    settled_at timestamptz,
    released_at timestamptz
);

CREATE INDEX IF NOT EXISTS action_usage_reservations_active
    ON action_usage_reservations(project_id, month)
    WHERE state IN ('pending', 'dispatched');

CREATE INDEX IF NOT EXISTS action_usage_reservations_expiry
    ON action_usage_reservations(project_id, month, expires_at)
    WHERE state IN ('pending', 'dispatched');
