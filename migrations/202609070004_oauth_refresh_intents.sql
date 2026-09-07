-- Persist dispatch before contacting a potentially rotating-token provider.
-- The current Go resolver also refuses degraded connections, so it cannot
-- unknowingly reuse the pre-dispatch token while an intent remains unresolved.
CREATE TABLE oauth_refresh_intents (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
 attempt_id text NOT NULL,
 secret_ref_id text NOT NULL,
 operation text NOT NULL CHECK (operation IN ('refresh','authorization')),
 state text NOT NULL CHECK (state IN ('authorizing','dispatched','unknown','completed')),
 state_digest text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (project_id, connection_id)
);
