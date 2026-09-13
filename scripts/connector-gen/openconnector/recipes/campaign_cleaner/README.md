# Campaign Cleaner

Read-only international **Campaign Cleaner API v1** recipe. Copy an API key from API Management in the Campaign Cleaner dashboard and store it as `apiKey`. Requests send `X-CC-API-Key` and `Accept: application/json` to `https://api.campaigncleaner.com`. POST operations also send `Content-Type: application/json`.

## Operations

- `healthcheck`: `GET /v1/get_credits` with empty input (remaining-credit probe; credits are consumed by `send_campaign`, not this read).
- `campaigns.list`: `GET /v1/get_campaign_list`.
- `campaigns.status.get`: `POST /v1/get_campaign_status` with required `campaignId` in `{campaign:{id}}`.
- `campaigns.get`: `POST /v1/get_campaign` with required `campaignId` and optional `minimizeHtml` (`minimize_html`).

Successful responses are raw provider JSON under AppCall `data`. HTTP 200 bodies with a non-empty `error` string fail via `bodyErrorPaths`. Campaign submit, delete, and PDF analysis download are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.campaigncleaner.com` and `X-CC-API-Key`. Native category is `email-marketing` (source Communication/Marketing are not both in the Rust CATEGORIES allowlist). Healthcheck uses `GET /v1/get_credits` rather than a billable send. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.campaigncleaner.com/api-reference/endpoint/get-credits. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
