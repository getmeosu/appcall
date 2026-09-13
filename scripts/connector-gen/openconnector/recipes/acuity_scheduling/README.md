# Acuity Scheduling

Read-only Acuity Scheduling REST API v1 recipe. Configure the numeric User ID (non-secret) and API key (secret) from https://secure.acuityscheduling.com/app.php?action=settings&key=api. The runner sends HTTP Basic authentication with User ID as the Basic username and the API key as the Basic password to `https://acuityscheduling.com/api/v1`, plus `Accept: application/json`. Official docs return HTTP 401 on authentication failure.

## Operations

- `healthcheck`: `GET /me` with empty input (pinned credential validator).
- `calendars.list`: `GET /calendars`.
- `appointment-types.list`: `GET /appointment-types` with optional `includeDeleted`.
- `forms.list`: `GET /forms`.
- `appointments.list`: `GET /appointments` with optional `max` (1–1000), `minDate`, `maxDate`, and `canceled`.

Appointment writes, reschedule/cancel, availability (`addonIDs[]` repeated query), and get-by-id are omitted. Successful responses are raw provider JSON under AppCall `data`. Native category is `scheduling` (source Productivity).

## Adaptations

Pinned source and official docs agree on `https://acuityscheduling.com/api/v1` and HTTP Basic `User ID:API Key`. Native Basic uses `http.auth.basic` rather than a handwritten header. GET requests omit `Content-Type` because the source only sets it when a JSON body is present. The upstream user-agent is not sent. Responses keep raw Acuity JSON under `data` instead of the pinned camelCase wrappers. OAuth2 multi-account access is not expressed.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
