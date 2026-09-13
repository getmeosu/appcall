# CallPage

Read-only international **CallPage REST API** recipe. Create an API token under Settings > API settings and store it as `apiKey`. Requests send `Authorization: <token>` (not Bearer) and `Accept: application/json` to `https://core.callpage.io`.

## Operations

- `healthcheck`: `GET /api/v1/external` with empty input (cheap authenticated hello probe; pinned credential validator).
- `users.list`: `GET /api/v1/external/users/all` with optional `offset` and `limit`.
- `widgets.list`: `GET /api/v1/external/widgets/all` with optional `offset` and `limit`.
- `widgets.get`: `GET /api/v1/external/widgets/get` with required `widgetId` (sent as `widget_id`).
- `calls.get`: `GET /api/v3/external/calls/{callId}`.

Successful responses are raw provider JSON under AppCall `data`. HTTP 200 bodies with `hasError: true` fail via `bodyErrorPaths`. Call-history list (array query filters), user lookup by exclusive id/email, widget callback creates, and other writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://core.callpage.io` and raw `Authorization`. Native category is `messaging` (source Communication/Productivity are not in the Rust CATEGORIES allowlist). Healthcheck uses the validator's `GET /api/v1/external` rather than call-history search. Official Get Widget example curl uses `?id=` while the parameter table and pinned source send `widget_id`; native follows the table and source. Official Get Single Call HTTP example shows `/api/v1/...` while the Action URL, curl, and pinned source use `/api/v3/external/calls/{call_id}`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://callpage.github.io/documentation-rest/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
