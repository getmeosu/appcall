# Databox

Read-only Databox API v1 recipe for the international product at `api.databox.com`. Admin users create an API key under Account Management → Profile → Password & Security. The runner sends the official `x-api-key` header plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /v1/accounts`), `accounts.list`, and `ingestions.get`. Official `GET /v1/auth/validate-key` is the pinned credential-validator path but is not an allowlisted action, so healthcheck uses the account list. Data-source/dataset creates and deletes, ingest pushes, and purges are omitted. Native category is `productivity`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `accounts.list`.
