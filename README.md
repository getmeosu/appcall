# AppCall

Integration infrastructure with a Rust API, durable workflow engine, worker,
embedded dashboard, and Bun TypeScript connector runtime.

The control plane manages credentials, OAuth, authorization, execution history,
and persistence. Connectors implement provider protocols. The workflow engine
is AppCall's own implementation; Temporal parity and production reliability
must be established through testing and operational evidence.

## Local development

Install Rust 1.94, Bun 1.4+, and native TLS build dependencies (CMake, pkg-config,
and OpenSSL development files on Linux). From a shell without production or
Anusa configuration:

```sh
bun install --frozen-lockfile
make run
```

Open http://127.0.0.1:5080. This uses the development API key `devkey` and bounded
in-memory storage when `APPCALL_DATABASE_URL` is omitted. State disappears on
restart. Without a configured runner, actions return explicit local simulation
results; this mode is not durable or live-provider evidence.

For real connector execution, configure the same `APPCALL_RUNNER_TOKEN` for
both processes, start `bun run runner:dev`, and set `APPCALL_RUNNER_URL` for the
API. See `.env.example` for configuration names; the binary does not load it
automatically. Never use the development key in production.

Durable application storage requires PostgreSQL, a stable `APPCALL_SECRET_KEY`,
and the bundled SQLx migrator for startup migrations. The Rust application
repositories currently use the synchronous `postgres` client for queries and
transactions; SQLx is limited to migration discovery, locking, checksums, and
application. The worker requires PostgreSQL. Authenticated dashboard accounts
additionally require an independently provisioned Anusa service and its
identity database; Anusa server software is not included here.

Runs controls are browser-only and deny-all by default. A deployment may opt in
specific authenticated users with `APPCALL_RUN_OPERATOR_GRANTS`, a JSON array
of exact pairs such as
`[{"projectId":"proj_tenant-a","userId":"11111111-1111-1111-1111-111111111111"}]`.
The project must use the browser identity format `proj_{tenant_id}` with a
nonempty tenant suffix; other project formats fail startup validation.
Add or revoke grants only through a controlled application restart. The policy
is captured once when application shared state starts, accepts at
most 128 pairs and 16 KiB, and rejects duplicate, wildcard, blank, whitespace,
control-character, or unknown fields. Every browser request still requires a
fresh active Anusa membership, the matching tenant/project, and the existing
brand/account grants. The setting does not authorize `/v1` API mutations and
does not turn the development/platform API key or an Anusa membership role
into a Runs operator grant.

Browser URLs use Connectors, Connections, Events, Usage, Certification, and
Settings Team. For one compatibility release, exact legacy GET routes return
301 with the original query preserved. Legacy POST routes are dispatched
internally once to the canonical handler instead of redirected: this preserves
form bodies, repeated fields, and CSRF checks without resubmitting mutations.
The `tk-*` and `trigger-*` browser hooks remain compatible for that release.
External SDK/API fields, `/v1` routes, connector manifests, and storage names
are unchanged. Sessions links recover to Account's sessions section.

## Database upgrades

Run details at `/app/runs/:id` read persisted sync transitions from
`sync_job_events`, introduced by migration `202609090001_sync_job_history.sql`.
New schedules, claims, page progress, retries, expired leases, terminal results,
and operator controls append bounded metadata in the same transaction as their
state change. History does not contain credentials, provider payloads, or raw
error messages. Page progress does not spend a failure attempt.

Existing jobs are not backfilled. Their earlier history and lifetime record
totals remain explicitly partial. Retry policy is shown only when a service
claim recorded its actual configuration; direct repository claims have no
policy evidence. Worker heartbeat is not inferred from a job lease.

The new `/v1/sync-runs/:id/history` endpoint and console detail links accept
1–256 ASCII letters, digits, hyphens, underscores or dots, excluding `.` and
`..`. Generated run IDs fit this contract. Existing engine, list and control
API limits are unchanged; custom engine IDs outside this console-safe subset
are not supported by the history/detail surface.

Back up and qualify the target database before rolling out this migration.
Do not roll back to a binary whose migration set predates this table: startup
checks migration history, and older writers do not record transitions. Use a
qualified forward fix or a coordinated database-and-binary restore instead.
Do not delete migration history or event data to force an older binary to start.

SQLx runs the existing numbered SQL files at startup and records checksums in
`_sqlx_migrations`. Keep applied migration files unchanged; add a new numbered
file for each schema change. No external migration executable or checksum
regeneration step is required. Migration connection settings must come from
`APPCALL_DATABASE_URL`; remove conflicting libpq `PG*` connection variables
from the process environment before startup.

Existing Atlas history is imported only when its complete, matching history is
in the application schema. The legacy rows are retained. If history is in Atlas's
separate default schema, startup refuses to guess which application schema it
belongs to. Before upgrading such a database, back it up, verify the actual target
schema and revision history, and have its administrator move the existing revision
table into that verified application schema. Do not drop history, create a fake
baseline, or rerun SQL manually. Partial or mismatched histories require repair
of the underlying migration state before startup. Atlas is a legacy-history
adoption path only; new schema changes use numbered SQLx migration files.

Migration `202609120002_connection_generation.sql` gives connection identity a
separate `connection_generation` from the row-level `connection_revision`. A
generation advances when a connection is rebound or truly re-established,
while routine row updates and an in-flight OAuth refresh do not create a new
provider identity. Provider-event deduplication is scoped
to the project, connector, connection, generation, and provider event key.
Migration preserves older duplicate events in history while retaining one
canonical current-scope identity; do not rewrite historical events to force
deduplication.

Migration `202609120003_webhook_outbox_dead_letter.sql` bounds webhook delivery
failures at ten attempts. Before the terminal attempt, pending rows retry with
bounded backoff. On the tenth failed dispatch, the outbox row becomes
`dead_letter`, stores only a safe mapped `last_error_code` and the database
`dead_lettered_at` timestamp, and is no longer selected for automatic delivery.
The webhook payload and authenticated event history remain preserved. After
correcting the connection, an authenticated principal with the
`events:read` and `events:replay` scopes can call
`POST /v1/webhook-events/{eventId}/replay`; the route returns `202` and
schedules a fresh replay job without deleting the event or silently reopening
the dead-letter row.

### Secret-envelope retention

The worker runs one bounded secret-cleanup pass on each jobs tick. It considers
envelopes older than `APPCALL_SECRET_RETENTION_DAYS` (default 7 days, maximum
3650) and deletes only unreferenced rows. Connection and provider-subaccount
references, unresolved OAuth refresh/authorization intents, and PKCE envelopes
remain protected; completed authorization clears its explicit PKCE reference.
Legacy unresolved PKCE intents without a persisted reference are conservatively
protected by their connection-bound envelope kind. Each cleanup transaction
scans at most 1,000 globally age/id-ordered rows and deletes at most
`APPCALL_SECRET_CLEANUP_BATCH` rows (default 100, maximum 1,000), using the
worker's `APPCALL_WORKER_INTERVAL_MS` cadence (default 1,000 ms, maximum
60,000 ms). Row locks and restrictive foreign keys make a concurrent reference
writer skip or fail safely rather than lose its credential reference.

The `202609120002` through `202609120004` migrations require a coordinated
forward rollout: quiesce old API and worker binaries, apply all migrations, and
then start binaries built with the same migration set. The new outbox status
check rejects an old binary's dispatched-at-only update, and new OAuth queries
read `pkce_secret_ref_id` unconditionally. Do not run mixed old and new
binaries against the upgraded schema.

## Provider workspace maintenance

For each project, Unipile credential resolution considers only platform-owned
rows whose status is `active`; inactive rows are ignored. Keep exactly one
active platform Unipile workspace for a project. If no active row or more than
one active row matches, the provider fails closed with `UNIPILE_UNAVAILABLE`
instead of choosing a workspace arbitrarily. Disable or retire stale rows
before retrying provider operations.

## Checks

```sh
make test
make check-rust
make build-clean
python3 scripts/test-public-release.py
```

PostgreSQL integration checks use `make test-integration` with
`APPCALL_ENGINE_POSTGRES_URL` and `APPCALL_TEST_DATABASE_URL` configured.
Live provider checks require separate credentials; fixture tests do not certify
live provider behavior.

## Licensing and releases

AppCall's first-party platform, workflow engine, and connector runtime are
source-available under **Elastic License 2.0 (ELv2)**. You may use, modify, and
self-host them subject to the license. Providing a substantial set of their
features to third parties as a hosted or managed service requires a separate
grant. ELv2 is not an OSI-approved open-source license.

See [LICENSE](LICENSE) for the unmodified terms, [NOTICE](NOTICE) for Meosu
attribution, and [LICENSING](LICENSING) for scope, usage guidance, and historical
grants. Previously published AGPL-3.0-only versions retain their original
license grants. Third-party terms remain in [third_party/NOTICE](third_party/NOTICE).
This repository does not introduce an enterprise implementation or a
license-key requirement.

Public releases use `scripts/public-release.py export --source . --destination
/absolute/new-directory` to construct an allowlisted snapshot without private
Git history. The release gate rejects unresolved legal notices and unreviewed
enterprise code. Only this README is included as Markdown.
