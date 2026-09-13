# Cloudflare Worker

Read-only international **Cloudflare Workers API** recipe. Create an API token with Workers Scripts Read (and Account Read for listing accounts) at https://dash.cloudflare.com/profile/api-tokens. Store the token as `apiKey` and the Cloudflare account ID as `accountId`. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://api.cloudflare.com/client/v4`. OAuth is documented by Cloudflare but is not used in this recipe.

## Operations

- `healthcheck`: `GET /user/tokens/verify` with empty input (cheap authenticated token verify; pinned credential validator).
- `accounts.list`: `GET /accounts` with optional `page` and `perPage`.
- `workers.list`: `GET /accounts/{accountId}/workers/workers` using the stored account ID, with optional `page`, `perPage`, `order` (`asc`|`desc`), and `orderBy`.
- `workers.get`: `GET /accounts/{accountId}/workers/workers/{workerId}`; `workerId` is a required non-empty string.
- `scripts.list`: `GET /accounts/{accountId}/workers/scripts` with optional `page` and `perPage`.

Successful responses are raw provider JSON under AppCall `data`. Writes, multipart script uploads, builds, and secrets are omitted.

## Adaptations

Pinned source and official docs agree on Bearer API tokens at `api.cloudflare.com/client/v4`. Native category is `dev-tools` (source Developer Tools). The upstream user-agent is not sent. HTTP 200 envelopes with a populated `errors` array are treated as failures via `http.errors.bodyErrorPaths`. Account-token verify fallback is omitted because native cannot branch. Current list-scripts docs emphasize an optional `tags` filter; native retains pinned `page`/`per_page`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ and https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/. Historical Thanksgiving 2023 Atlassian and August 2025 Salesloft Drift incidents are dated and waived. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
