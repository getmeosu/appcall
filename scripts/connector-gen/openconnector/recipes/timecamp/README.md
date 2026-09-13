# TimeCamp

International TimeCamp third-party API recipe. Copy the API token from TimeCamp **Profile Settings** (avatar → Profile Settings, token at the bottom of the page) and store it as `apiKey`. Requests use `Authorization: Bearer <token>` against `https://app.timecamp.com/third_party/api`.

## Operations

- `healthcheck` — `GET /me` (current user object). Cheap authenticated read.
- `users.list` — `GET /users`. Optional `activeOnly` is sent as query `active_only`.
- `tasks.list` — `GET /tasks`. Optional `status` is `active`, `archived`, or `all`. Raw body is an object map keyed by task id.
- `timeEntries.list` — `GET /entries?from=&to=`. Both dates are required (`YYYY-MM-DD`).

Provider next URLs are never followed. Live authentication is unverified; fixtures are supplied independently of the live API.

## Adaptations

- Current official TimeCamp TypeScript client (`timecamp-org/timecamp-api-ts`) uses host `app.timecamp.com`, `Authorization: Bearer <token>`, and `Accept: application/json`. Older public docs used `www.timecamp.com` with `api_token` in the path or query. Pipedream still uses `www.timecamp.com` and a raw `Authorization` token without Bearer. This recipe follows the current official client and the pinned OpenConnector source.
- The official client adds `format=json` on GET requests. This recipe sets `Accept: application/json` and does not add `format`.
- The official client `tasks.getAll()` always sends `status=all` and then `Object.values` the map. This recipe leaves `status` optional and returns the raw map under `data`.
- The official client `timeEntries.get()` maps `date_from`/`date_to` onto query `from`/`to` and always sets `opt_fields=tags`. This recipe uses the wire names `from`/`to` and does not add `opt_fields`.
- `GET /users` may be a JSON array (older official docs) or an object map (official client). `outputSchema.data` allows both.

## Source and license

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://help.timecamp.com/help/api and https://developer.timecamp.com/. Fixture-only; live smoke unverified.
