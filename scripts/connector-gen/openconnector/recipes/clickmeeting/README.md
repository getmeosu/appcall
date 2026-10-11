# ClickMeeting

International ClickMeeting REST API v1 recipe. Configure the API key from ClickMeeting account settings. The runner sends `X-Api-Key` to `https://api.clickmeeting.com/v1` with `Accept: application/json`.

Covered operations: origin `healthcheck` (`GET /ping`), `conferences.list`, `conferences.get`, `sessions.list`, and `recordings.list`, plus the remaining Composio CLICKMEETING tools (create/update/delete rooms, contacts, tokens, autologin, invitations, registrations, files, recordings, chats, skins, time zones, phone gateways, session attendees/polls/surveys/PDF). Writes use `application/x-www-form-urlencoded`. `upload_file` is multipart field `uploaded`. `download_file` returns base64 when the body is not JSON.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://dev.clickmeeting.com/api-doc/ and https://docs.composio.dev/toolkits/clickmeeting. Fixtures are independently derived from official docs plus the Composio toolkit page and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `conferences.list` with `{"status":"active"}`.
