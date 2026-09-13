# Raisely

Read-only international **Raisely REST API v3** recipe. Raisely is an Australian nonprofit fundraising platform.

## Setup

Create a campaign secret key in Raisely admin under Settings → API & Webhooks. Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.raisely.com/v3`.

## Operations

- `healthcheck`: `GET /campaigns?limit=1` with empty input (cheap authenticated list probe). The pinned validator uses `GET /authenticate`, which is not an upstream action ID.
- `campaigns.list`: `GET /campaigns` with optional `private`, `query` (wire name `q`), `limit`, `offset`, `sort`, and `order`.
- `campaigns.get`: `GET /campaigns/{campaign}`; `campaign` is UUID, path, or domain.
- `profiles.list`: `GET /profiles` with required `campaign` and optional `private`, `query` (wire name `q`), `limit`, and `offset`.
- `profiles.get`: `GET /profiles/{profilePath}` with required `profilePath` and optional `campaign` and `private`.

Successful responses are raw provider JSON under AppCall `data`. Writes, webhooks, donations, and rank filters are omitted.

## Adaptations

Pinned source and official OpenAPI agree on `https://api.raisely.com/v3` and Bearer auth. Native category is `payments` (source Finance is not in native CATEGORIES). Healthcheck uses the campaign list probe rather than a billable search.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
