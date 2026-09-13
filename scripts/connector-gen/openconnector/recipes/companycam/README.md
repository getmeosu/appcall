# CompanyCam

Read-only international **CompanyCam Core API v2** recipe for the US construction photo SaaS at [companycam.com](https://companycam.com). This is the documented v2 Core API at `https://api.companycam.com/v2` with a Bearer access token. Official getting-started notes these v2 docs are the legacy Core API depreciating early 2027; the newer `developers.companycam.com` edition is out of scope.

## Setup

Generate an access token in the CompanyCam app at `https://app.companycam.com/access_tokens`. Store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json`. Partner OAuth is not used.

## Operations

- `healthcheck`: `GET /company` with empty input (cheap authenticated account read).
- `users.current`: `GET /users/current`.
- `projects.list`: `GET /projects` with optional `page`, `perPage` (sent as `per_page`, 1–100), and `query`.
- `projects.get`: `GET /projects/{projectId}`; the ID is percent-encoded as one path segment.
- `users.list`: `GET /users` with optional page filters.

Successful responses are raw provider JSON under AppCall `data`. List endpoints return JSON arrays. Writes, photo/multipart upload, tags, and `modified_since` are omitted.

## Adaptations

Pinned source and official v2 OpenAPI agree on host, Bearer auth, and resource paths. Native `perPage` maps to query `per_page`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
