-- Crash-safe idempotency: a durable in-flight marker on the claim record.
-- dispatched_at is NULL while the claim is merely pending (acquired but the
-- side-effecting dispatch has not begun) and is set just before dispatch. A
-- non-NULL dispatched_at means the original attempt entered the dispatch
-- boundary, so a retry must fail closed (never re-dispatch) until a terminal
-- record in action_idempotency_records confirms completion.
ALTER TABLE action_idempotency_claims
    ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
