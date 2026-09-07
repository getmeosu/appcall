CREATE TABLE IF NOT EXISTS qa_connector_status (
    connector      text PRIMARY KEY,
    overall        text NOT NULL,
    total          integer NOT NULL DEFAULT 0,
    passed         integer NOT NULL DEFAULT 0,
    failed         integer NOT NULL DEFAULT 0,
    not_certified  integer NOT NULL DEFAULT 0,
    results        jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_run_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT qa_connector_status_overall_check
        CHECK (overall IN ('green','partial','red'))
);
