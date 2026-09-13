# ReferralHero

Read-only international ReferralHero REST API v2 recipe. Copy the API token from Dashboard > Account > API and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://app.referralhero.com/api/v2`.

## Operations

- `healthcheck`: `GET /lists?page=1` (cheap authenticated read; matches pinned credential validation).
- `lists.list`: `GET /lists` with optional `page`.
- `subscribers.list`: `GET /lists/{campaignId}/subscribers` with required campaign UUID and optional `page`.
- `subscribers.get`: `GET /lists/{campaignId}/subscribers/{subscriberId}`.
- `rewards.list`: `GET /lists/{campaignId}/bonuses`.

Successful responses are raw provider JSON under AppCall `data`. Create/update/delete subscriber and conversion writes are omitted.

## Adaptations

Pinned source and official docs agree on Bearer auth and `/api/v2` paths. Native category is `crm` (source Marketing is not in the Rust CATEGORIES allowlist). ReferralHero can answer HTTP 200 with `{status:"error", code, message}`; native `bodyErrorPaths` use a non-empty top-level `code` because `status=ok` would trip a string path.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
