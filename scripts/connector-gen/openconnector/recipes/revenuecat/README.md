# RevenueCat

Read-only international **RevenueCat REST API v2** recipe. Create a V2 secret API key (`sk_…`) under Project settings → API keys with project/customer read permissions. Store it as `apiKey`. Requests send `Authorization: Bearer {{apiKey}}` and `Accept: application/json` to `https://api.revenuecat.com`.

## Operations

- `healthcheck`: `GET /v2/projects?limit=1` with empty input (cheap authenticated project probe; pinned credential validator).
- `projects.list`: `GET /v2/projects` with optional `startingAfter` (`starting_after`) and `limit` (1–100).
- `customers.list`: `GET /v2/projects/{{projectId}}/customers` with required `projectId` and optional `search`, `startingAfter`, and `limit`.
- `customers.get`: `GET /v2/projects/{{projectId}}/customers/{{customerId}}`.
- `entitlements.list`: `GET /v2/projects/{{projectId}}/entitlements` with required `projectId` and optional pagination.

Successful responses are raw provider JSON under AppCall `data`. Metrics, subscription search, expand arrays, writes, public SDK keys, and OAuth access tokens are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.revenuecat.com/v2` and `Authorization: Bearer` with a v2 secret key. Native category is `payments` (source Finance/Developer Tools/Subscriptions are not in the Rust CATEGORIES allowlist). API v1 keys do not work. The upstream user-agent is not sent. Identifier `maxLength` bounds from the pinned source are omitted because native strict-generated schemas reject `maxLength`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
