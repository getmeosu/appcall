# Chattermill

Read-only Chattermill REST API v1 recipe for the international product at `api.chattermill.com`. Create an API key under Chattermill Settings → API (`https://app.chattermill.com/settings/api`). The runner sends `Authorization: Bearer <key>`.

Covered operations: credential-only `healthcheck` (`GET /projects`), `projects.list`, `projects.get`, `responses.list`, and `responses.get`. Create/update/delete response, response search, metrics, and taxonomy writes are omitted.

`responses.list` uses the official/pinned path `GET /{project}/responses` (not `/projects/{id}/responses`) with optional `page` and `perPage` (`per_page`). Native category is `crm` because Rust CATEGORIES has no marketing/data bucket.

Official `apidocs.chattermill.com` is a JS SPA; paths were confirmed against the user guide, Pipedream actions that cite those docs, and pinned source.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `projects.list`.
