CREATE TABLE IF NOT EXISTS schema_migrations_guard (
    id bigint PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
    id text PRIMARY KEY,
    name text NOT NULL,
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key_hash text NOT NULL UNIQUE,
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_project_id ON api_keys(project_id);

CREATE TABLE IF NOT EXISTS secret_envelopes (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind text NOT NULL,
    key_id text NOT NULL,
    algorithm text NOT NULL,
    nonce bytea NOT NULL,
    ciphertext bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secret_envelopes_project_id ON secret_envelopes(project_id);

CREATE TABLE IF NOT EXISTS connections (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connector text NOT NULL,
    auth_type text NOT NULL,
    status text NOT NULL,
    secret_ref_id text REFERENCES secret_envelopes(id) ON DELETE SET NULL,
    last_test_status text NOT NULL DEFAULT 'unknown',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connections_project_id ON connections(project_id);
CREATE INDEX IF NOT EXISTS idx_connections_connector ON connections(project_id, connector);

CREATE TABLE IF NOT EXISTS action_logs (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    connector text NOT NULL,
    action text NOT NULL,
    status text NOT NULL,
    error_code text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_project_id ON action_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_connection_id ON action_logs(connection_id);

CREATE TABLE IF NOT EXISTS usage_events (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id text REFERENCES connections(id) ON DELETE SET NULL,
    connector text NOT NULL,
    action text NOT NULL,
    kind text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_project_id ON usage_events(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_occurred_at ON usage_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);

CREATE TABLE IF NOT EXISTS usage_monthly_rollups (
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    month text NOT NULL,
    kind text NOT NULL,
    quantity bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, month, kind)
);

CREATE INDEX IF NOT EXISTS idx_usage_monthly_rollups_project_month ON usage_monthly_rollups(project_id, month);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    operation text NOT NULL,
    status text NOT NULL,
    worker_id text NOT NULL DEFAULT '',
    attempts integer NOT NULL DEFAULT 0,
    run_after timestamptz NOT NULL DEFAULT now(),
    leased_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_claim ON sync_jobs(status, run_after, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_project_id ON sync_jobs(project_id);

CREATE TABLE IF NOT EXISTS sync_cursors (
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    operation text NOT NULL,
    cursor text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (connection_id, operation)
);

CREATE TABLE IF NOT EXISTS synced_messages (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_message_id text NOT NULL,
    channel_id text NOT NULL,
    sender_id text NOT NULL,
    text text NOT NULL,
    model_version text NOT NULL,
    raw jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synced_messages_project_id ON synced_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_synced_messages_connection_channel ON synced_messages(connection_id, channel_id);

CREATE TABLE IF NOT EXISTS webhook_events (
    id text NOT NULL,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    connector text NOT NULL,
    operation text NOT NULL DEFAULT '',
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, id),
    UNIQUE (project_id, id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_connection_id ON webhook_events(connection_id);

CREATE TABLE IF NOT EXISTS action_replay_logs (
    id text PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connection_id text NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    connector text NOT NULL,
    action text NOT NULL,
    request_id text NOT NULL,
    sanitized_input jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_replay_logs_project_id ON action_replay_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_action_replay_logs_request_id ON action_replay_logs(request_id);
