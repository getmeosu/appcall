# Apify

Read-only Apify REST API v2 recipe for the international product at `api.apify.com`. Configure an API token from Apify Console (Settings > API & Integrations). The runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v2/users/me`), `users.me`, `actors.get`, `runs.get`, and `datasets.items`. Actor run POSTs and other writes are omitted. `actors.get` uses the canonical official path `/v2/actors/{actorId}` rather than the pinned legacy `/v2/acts/` alias (still functional per Apify). Actor IDs use the official `owner~name` tilde form. `datasets.items` returns a JSON array.

Native category is `dev-tools` (source Developer Tools / Data). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.apify.com/api/v2. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the token, call `healthcheck` with `{}`, then `users.me`.
