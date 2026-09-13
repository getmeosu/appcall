# Beeminder

Read-only Beeminder API v1 recipe for the international goal-tracking product. Store a personal auth token from `https://www.beeminder.com/api/v1/auth_token.json` after signing in. Requests use `https://www.beeminder.com/api/v1` and send the token as the `auth_token` query parameter plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /users/me.json` with empty input.
- `users.get`: `GET /users/{username}.json` with required `username` and optional `associations`, `diffSince` (`diff_since`), `skinny`, and `datapointsCount` (`datapoints_count`).
- `goals.list`: `GET /users/{username}/goals.json`.
- `goals.get`: `GET /users/{username}/goals/{goalSlug}.json` with optional `datapoints`.
- `datapoints.list`: `GET /users/{username}/goals/{goalSlug}/datapoints.json` with optional `count`, `page`, and `per`.

Writes, form-encoded datapoint mutation, and archived-goal listing are omitted. Successful responses are preserved as raw provider JSON under AppCall `data`. List endpoints return JSON arrays.

## Testing and live smoke

Fixtures are supplied evidence only. They cover success, unauthorized 401, missing `username`, and an extra healthcheck field. Fixtures do not prove live credentials. For live smoke, use a personal auth token, invoke `healthcheck`, then read one user, goal list, goal, and datapoints.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
