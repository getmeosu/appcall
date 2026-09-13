# Lattice

Read-only international **Lattice Public API** recipe for the documented US residency host. Lattice is the people/performance platform at [lattice.com](https://lattice.com/). Generate an API key in Admin → Platform → API keys and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.latticehq.com`.

Official docs also describe EMEA residency at `https://api.emea.latticehq.com`. Native templates cannot switch hosts from an optional enum without a caller-supplied host, so this recipe pins the documented US production URL.

## Operations

- `healthcheck`: `GET /v1/me` with empty input (cheap authenticated current-user probe).
- `users.list`: `GET /v1/users` with optional `limit` (1–100), `startingAfter`, and `status` (`ACTIVE`, `INVITED`, `CREATED`, `DEACTIVATED`).
- `users.get`: `GET /v1/user/{userId}` (singular `user` path).
- `departments.list`: `GET /v1/departments` with optional `limit` and `startingAfter`.
- `goals.list`: `GET /v1/goals` with optional `limit`, `startingAfter`, and `state` (`active` or `ended`).

Successful responses are raw Lattice JSON under AppCall `data`. Cursor pagination is caller controlled; `endingCursor` is not followed. Writes, SCIM, reviews, and EMEA host selection are omitted.

## Adaptations

Pinned source and official docs agree on Bearer auth and `/v1/me`. Native category is `productivity` (source Productivity/Data; `Data` is not in the Rust CATEGORIES allowlist). User `status` uses the official OpenAPI enum rather than the pinned source's lowercase values and `null_string` mapping. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
