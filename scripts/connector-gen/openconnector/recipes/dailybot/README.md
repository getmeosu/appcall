# Dailybot

Read-only Dailybot REST API v1 recipe for the international product at `api.dailybot.com`. Org administrators create or revoke an API key under Organization Settings → Integrations. The runner sends the official `X-API-KEY` header (plus `Accept` and `Content-Type: application/json`, which the docs require).

Covered operations: credential-only `healthcheck` (`GET /v1/me/`), `me.get`, `organization.get`, `users.list`, and `users.get`. Messaging, email, conversation, invitation, and team-membership writes are omitted. Trailing slashes match official paths.

`users.list` admits optional `is_active`, `role`, `limit`, and `offset` from the pinned source. Current docs also document `page`/`page_size` with `limit`/`offset` as aliases; native keeps the pinned names. Native category is `productivity`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `organization.get`.
