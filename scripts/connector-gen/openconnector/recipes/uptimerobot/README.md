# UptimeRobot

Read-only UptimeRobot legacy v2 API recipe for the international UptimeRobot service. Configure a main or read-only API key from My Settings / Integrations & API. The runner sends `api_key` and `format=json` in an `application/x-www-form-urlencoded` POST body; no Authorization header is added. Covered operations are credential-only `healthcheck` and `account.get` (`POST /getAccountDetails`), `monitors.list` (`POST /getMonitors`), and `alertContacts.list` (`POST /getAlertContacts`). UptimeRobot answers many failures, including invalid keys, as HTTP 200 with `{ "stat": "fail", "error": { ... } }`; `http.errors.bodyErrorPaths` is `["error"]` so those bodies are connector errors. Responses keep the raw provider JSON under `data`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live smoke is unverified.

## Setup

Create a main or read-only API key in the UptimeRobot dashboard (My Settings). Monitor-specific keys only work with `getMonitors` and are not sufficient for healthcheck/`account.get`.

## Operations

- `healthcheck` — cheapest authenticated read: `POST /getAccountDetails` with `api_key` + `format=json`.
- `account.get` — same account-details request as healthcheck.
- `monitors.list` — `POST /getMonitors` with optional `limit` (1–50), `offset` (>=0), and `search`. Unset optionals are omitted from the form body.
- `alertContacts.list` — `POST /getAlertContacts` with no extra fields, matching the pinned source action.

Writes, `get_monitor` (filtered list plus first-item extraction), and hyphen-joined array filters are not exposed.

## Adaptations

- Raw AppCall provider JSON contract; `request.result` omitted.
- Credential presence uses `http.auth.field=apiKey`. `http.auth.name` is omitted so compile does not send a fake header.
- Do not put `stat` on `bodyErrorPaths`: the success value `"ok"` is a non-empty string and would fail every successful call.

## License / attribution

Upstream provider mapping from oomol-lab/open-connector revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official API: https://uptimerobot.com/api/legacy/

## Live smoke

Fixture-only. Live authentication remains unverified.
