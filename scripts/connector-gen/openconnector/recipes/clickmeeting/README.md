# ClickMeeting

Read-only ClickMeeting REST API v1 recipe for ClickMeeting Sp. z o.o. (Gdańsk, Poland). Configure the API key from ClickMeeting account settings. The runner sends `X-Api-Key` to `https://api.clickmeeting.com/v1`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /ping`), `conferences.list` (`GET /conferences/{status}` with optional `page`), `conferences.get`, `sessions.list`, and `recordings.list` (`GET /conferences/recordings`). Create/update/delete room writes, token generation, registration POSTs, and chat archive downloads are omitted because they use form encoding, mutation, or binary content the native template does not expose here.

Adaptations versus the pinned OpenConnector source: the upstream user-agent is not sent; responses keep raw ClickMeeting JSON under `data` instead of the source conference/session/recording unwraps. `status` is the documented `active` or `inactive` path segment.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://dev.clickmeeting.com/api-guide/ and https://dev.clickmeeting.com/api-doc/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `conferences.list` with `{"status":"active"}`.
