# Daily

Read-only Daily REST API v1 recipe for the international WebRTC product at `api.daily.co`. Domain owners view or regenerate the API key under Developers in the Daily dashboard. The runner sends `Authorization: Bearer <key>` plus `Accept` and `Content-Type: application/json`, matching official curl examples.

Covered operations: credential-only `healthcheck` (`GET /` on `https://api.daily.co/v1`), `domain.get`, `rooms.list`, and `rooms.get`. Room create/update/delete, meeting tokens, recordings, and webhooks are omitted. Native category is `messaging`. Distinct from Dailybot.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `rooms.list`.
