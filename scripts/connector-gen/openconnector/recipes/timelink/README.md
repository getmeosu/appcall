# timelink

Read-only international **timelink** recipe for the documented API at `https://api.timelink.io/api/v1`. timelink is the project time-tracking product at [timelink.io](https://timelink.io/). Create an API token in Mein Konto → API-Tokens ([docs](https://docs.timelink.io/api)) and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json`.

## Operations

- `healthcheck`: `GET /token` with empty input (cheap authenticated token probe).
- `company.get`: `GET /company` with empty input.
- `users.list`: `GET /users` with optional `limit` (≥ 1).
- `clients.list`: `GET /clients` with optional `limit` (≥ 1).
- `projects.list`: `GET /projects` with optional `limit` (≥ 1).

Successful responses are raw timelink JSON under AppCall `data`. Writes, time-entry mutation, and list filters that require JSON-stringified `orders` or array `ids` are omitted.

## Adaptations

Pinned source and official docs agree on Bearer tokens at `api.timelink.io`. Native category is `productivity` (source Productivity). Native returns raw JSON under `data` instead of the pinned camelCase wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
