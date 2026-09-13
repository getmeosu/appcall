# DataForB2B

Read-only DataForB2B REST API recipe for the international product at `api.dataforb2b.ai`. Generate an API key under Settings → API Keys after signing in at `app.dataforb2b.ai`. The runner sends the official `api_key` header plus `Accept: application/json`. POST count also sends `Content-Type: application/json`.

Covered operations: credential-only `healthcheck` (`GET /account`), `account.get`, `results.count` (documented as free), and `typeahead`. Billable people/company search and enrich endpoints are omitted. Marketing pages that advertise `/v1/people/search` and Bearer auth disagree with current docs and the pinned source; native follows the docs. Native category is `crm`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `account.get`.
