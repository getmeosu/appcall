# HeyReach

Read-only international **HeyReach Public API** recipe. Create an API key in HeyReach Settings → Integrations / API and store it as `apiKey`. Requests send `X-API-KEY` and `Accept`/`Content-Type: application/json` to `https://api.heyreach.io/api/public`.

## Operations

- `healthcheck`: `POST /campaign/GetAll` with hardcoded `offset=0` and `limit=1` (cheap authenticated read). Official `GET /auth/CheckApiKey` is documented with an empty 200 body, which native JSON `responseFormat` cannot accept.
- `campaigns.list`: `POST /campaign/GetAll` with optional JSON `offset`, `limit` (1–100), and `keyword`.
- `campaigns.get`: `GET /campaign/GetById?campaignId=`; `campaignId` is a required positive integer.
- `lists.list`: `POST /list/GetAll` with optional JSON `offset` and `limit` (1–100).
- `accounts.list`: `POST /li_account/GetAll` with optional JSON `offset` and `limit` (1–100).

Successful responses are raw provider JSON under AppCall `data`. Writes, lead mutations, and stats endpoints are omitted.

## Adaptations

Pinned source and official Postman docs agree on `https://api.heyreach.io/api/public` and `X-API-KEY`. Native category is `crm` (source Marketing is not in the Rust CATEGORIES allowlist). List reads use POST JSON bodies as documented.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
