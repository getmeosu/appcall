# Aircall

Read-only international Aircall Public API recipe. Configure the dashboard API ID (Basic Auth username) and API token (password). The runner sends `Authorization: Basic` to `api.aircall.io`.

Covered operations: credential-only `healthcheck` (`GET /v1/ping`), `users.list` / `users.get` on Users V2, `numbers.list`, and `teams.list`. Pagination is caller-controlled (`page`, `per_page` 1–50). Provider next-page links are returned as data and never followed. Writes, OAuth, call listing, and contact search are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
