# AppCall

Integration infrastructure with a Rust API, durable workflow engine, worker,
embedded dashboard, and Bun TypeScript connector runtime.

The control plane manages credentials, OAuth, authorization, execution history,
and persistence. Connectors implement provider protocols. The workflow engine
is AppCall's own implementation; Temporal parity and production reliability
must be established through testing and operational evidence.

## Local development

Install Rust 1.94, Bun 1.x, and native TLS build dependencies (CMake, pkg-config,
and OpenSSL development files on Linux). From a shell without production or
Anusa configuration:

```sh
bun install --frozen-lockfile
make run
```

Open http://127.0.0.1:5080. This uses the development API key `devkey` and bounded
in-memory storage. State disappears on restart. Without a configured runner,
actions return explicit local simulation results.

For real connector execution, configure the same `APPCALL_RUNNER_TOKEN` for
both processes, start `bun run runner:dev`, and set `APPCALL_RUNNER_URL` for the
API. See `.env.example` for configuration names; the binary does not load it
automatically. Never use the development key in production.

Durable application storage requires PostgreSQL, a stable `APPCALL_SECRET_KEY`,
and the bundled SQLx migrator for startup migrations. The worker requires PostgreSQL. Authenticated
dashboard accounts additionally require an independently provisioned Anusa
service and its identity database; Anusa server software is not included here.

Browser URLs use Connectors, Connections, Events, Usage, Certification, and
Settings Team. For one compatibility release, exact legacy GET routes return
301 with the original query preserved. Legacy POST routes are dispatched
internally once to the canonical handler instead of redirected: this preserves
form bodies, repeated fields, and CSRF checks without resubmitting mutations.
The `tk-*` and `trigger-*` browser hooks remain compatible for that release.
External SDK/API fields, `/v1` routes, connector manifests, and storage names
are unchanged. Sessions links recover to Account's sessions section.

## Database upgrades

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
of the underlying migration state before startup.

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

The current core is AGPL-3.0-only. See [LICENSE](LICENSE), [NOTICE](NOTICE) for
Meosu attribution, and [LICENSING](LICENSING) for component boundaries. Future
source-available enterprise modules require their own commercial terms. No
enterprise implementation is included today. Third-party terms are retained
in [third_party/NOTICE](third_party/NOTICE).

Public releases use `scripts/public-release.py export --source . --destination
/absolute/new-directory` to construct an allowlisted snapshot without private
Git history. The release gate rejects unresolved legal notices and unreviewed
enterprise code. Only this README is included as Markdown.
