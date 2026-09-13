# Givebutter

Read-only international **Givebutter REST API v1** recipe. Givebutter is a US nonprofit fundraising platform.

## Setup

Create an API key from the Givebutter Dashboard under Settings → Integrations → API Keys. Store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.givebutter.com`.

## Operations

- `healthcheck`: `GET /v1/campaigns?per_page=1` with empty input (cheap authenticated list probe; pinned credential validator).
- `campaigns.list`: `GET /v1/campaigns` with optional 1-indexed `page` and `per_page` (1–100).
- `campaigns.get`: `GET /v1/campaigns/{campaign_id}`; `campaign_id` is a required positive integer.
- `contacts.list`: `GET /v1/contacts` with the same optional page filters.
- `contacts.get`: `GET /v1/contacts/{contact_id}`; `contact_id` is a required positive integer.

Successful responses are raw provider JSON under AppCall `data`. List endpoints return `{data, links, meta}`. Get endpoints return the resource object. Writes, transactions, funds, plans, chapters, and unbounded extra query filters are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.givebutter.com/v1` and Bearer auth. Native category is `payments` (source Finance is not in the Rust CATEGORIES allowlist). Healthcheck uses the campaign list probe rather than a billable search.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
