# cloudlayer.io

Read-only international **cloudlayer.io v2 REST API** recipe. Create an API key in the cloudlayer.io dashboard and store it as `apiKey`. The runner sends `X-API-Key` and `Accept: application/json` to `https://api.cloudlayer.io`.

## Operations

- `healthcheck`: `GET /v2/account` with empty input (cheap authenticated account read; pinned credential validator).
- `jobs.list`: `GET /v2/jobs` with optional `limit` (1–100) and `startAfterId`.
- `jobs.get`: `GET /v2/jobs/{jobId}`; `jobId` is a required non-empty string.
- `assets.list`: `GET /v2/assets` with optional `limit` (1–100) and `startAfterId`.
- `assets.get`: `GET /v2/assets/{assetId}`; `assetId` is a required non-empty string.

Successful responses are raw provider JSON under AppCall `data`. Billable HTML/URL/template PDF generation is omitted.

## Adaptations

Pinned source and official docs agree on `https://api.cloudlayer.io` and the `X-API-Key` header. Native category is `dev-tools` (source Productivity/Developer Tools). The upstream user-agent is not sent. Pinned source maps HTTP 402 to a throttle; native retries 402 and 429. List endpoints return JSON arrays, so those operations declare `data` as an array.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://cloudlayer.io/docs/api-overview/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
