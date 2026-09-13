# Aimfox

Read-only international **Aimfox Public API v2** recipe. Create an API key in Workspace Settings → Integrations and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.aimfox.com/api/v2`.

## Operations

- `healthcheck`: `GET /campaigns` (cheap authenticated read; same path as the pinned credential validator).
- `campaigns.list`: `GET /campaigns` with optional query `outreach_type` (`inbound`|`outbound`) and `accepts_profiles`.
- `campaigns.get`: `GET /campaigns/{campaign_id}`.
- `leads.get`: `GET /leads/{lead_id}`.
- `labels.list`: `GET /labels`.

Successful responses are raw provider JSON under AppCall `data`. Writes, lead search POSTs, analytics, and audience mutations are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.aimfox.com/api/v2` and Bearer auth. Native category is `crm` (source Marketing/Communication are not in the Rust CATEGORIES allowlist). Distinct from Aimfox LLP (Vadodara accounting).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
