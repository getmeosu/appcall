# Appcues

Read-only international **Appcues Public API v2** recipe for the US host. Create an API key and secret in Studio (Settings → API Keys). Store them as `apiKey` and `apiSecret`, plus the numeric/string `accountId` from the Studio account page. The runner sends HTTP Basic authentication (`API_KEY:API_SECRET`) to `https://api.appcues.com` with `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v2/accounts/{accountId}/tags` with empty input (cheap authenticated tag list; pinned credential validator).
- `tags.list`: `GET /v2/accounts/{accountId}/tags`.
- `tags.get`: `GET /v2/accounts/{accountId}/tags/{tag_id}`; `tag_id` is a required non-empty string.
- `flows.list`: `GET /v2/accounts/{accountId}/flows-v2` (Flow 2.0).
- `flows.get`: `GET /v2/accounts/{accountId}/flows-v2/{flow_id}`; `flow_id` is a required non-empty string.

Successful responses are raw provider JSON under AppCall `data`. Publish/unpublish, segments, end-user writes, bulk import/export, and the EU host `api.eu.appcues.com` are omitted.

## Adaptations

Official curl uses `-u API_KEY:API_SECRET`. Native Basic uses `http.auth.basic` with the API key as username and the API secret as password, matching pinned `Buffer.from(\`${apiKey}:${apiSecret}\`)`. Required stored `accountId` is interpolated into the path. The US host is pinned (pinned default region); EU is a computed if/else host and is not admitted. Native category is `productivity` (source Marketing/Data are not in Rust CATEGORIES; Appcues is in-app onboarding/guidance). The upstream user-agent is not sent. List operations return the raw JSON array under `data` instead of the source `{tags}` / `{flows}` wrappers.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.appcues.com/v2/docs. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
