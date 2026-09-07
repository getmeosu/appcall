-- Billing plan assignment per project. The plan CATALOG (what each plan_key
-- grants) is versioned Go code (internal/billing/catalog.go) — only the
-- ASSIGNMENT lives in the database, so changing a tier's limits is a deploy,
-- not a data migration, and the two can never drift. A project with no row
-- runs on the env-var defaults (legacy/back-compat); the resolver treats any
-- non-'active' status as the free tier (fail-closed downgrade).
CREATE TABLE IF NOT EXISTS project_plans (
    project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    plan_key text NOT NULL DEFAULT 'free',
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'past_due', 'canceled')),
    -- Bespoke per-customer bumps layered over the catalog entry (e.g. one extra
    -- Unipile seat for a pilot). Keys mirror billing.Entitlements field names;
    -- unknown keys are ignored by the resolver so old rows survive new code.
    overrides jsonb NOT NULL DEFAULT '{}',
    current_period_end timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent ledger of provider billing webhooks (Razorpay/Stripe later; the
-- manual-provisioning P0 writes rows with provider='admin' for auditability).
-- The PRIMARY KEY on the provider event id is the idempotency guard: a
-- redelivered webhook inserts ON CONFLICT DO NOTHING and never double-applies.
CREATE TABLE IF NOT EXISTS billing_events (
    id text PRIMARY KEY,
    provider text NOT NULL,
    type text NOT NULL,
    project_id text,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_project
    ON billing_events (project_id, received_at);
