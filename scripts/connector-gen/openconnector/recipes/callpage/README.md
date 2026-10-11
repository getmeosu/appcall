# CallPage

International **CallPage REST API** recipe. Create an API token under Settings > API settings and store it as `apiKey`. Requests send `Authorization: <token>` (not Bearer) and `Accept: application/json` to `https://core.callpage.io`.

## Operations

Origin (0.1.0):

- `healthcheck`: `GET /api/v1/external` (Composio `CALLPAGE_GET_API_ROOT`).
- `users.list`: `GET /api/v1/external/users/all` with optional `offset` and `limit`.
- `widgets.list`: `GET /api/v1/external/widgets/all` with optional `offset` and `limit`.
- `widgets.get`: `GET /api/v1/external/widgets/get` with required `widgetId` (sent as `widget_id`).
- `calls.get`: `GET /api/v3/external/calls/{callId}` (kept from origin; not a Composio tool).

Composio depth (0.2.0) adds the remaining CALLPAGE HTTP tools as real requests: users create/update/delete, widgets create/update/delete/add-users/call-or-schedule, managers CRUD plus status statistics (GET managers/all), SMS and voice list/create/update-or-reset, and call history.

Successful responses are raw provider JSON under AppCall `data`. HTTP 200 bodies with `hasError: true` fail via `bodyErrorPaths`. CallPage deletes use POST.

## Adaptations

Pinned source and official docs agree on `https://core.callpage.io` and raw `Authorization`. Native category is `messaging`. Healthcheck uses the validator's `GET /api/v1/external`. Official Get Widget example curl uses `?id=` while the parameter table and pinned source send `widget_id`; native follows the table and source. Call history array filters use official `foo[]` query names. `CALLPAGE_POST_WIDGET_CALL_OR_SCHEDULE` is `POST /widgets/call-or-schedule`, not the simple `/widgets/call` helper. `CALLPAGE_GET_MANAGER_STATUS_STATISTICS` has no dedicated REST path and reads `GET /managers/all`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://callpage.github.io/documentation-rest/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
