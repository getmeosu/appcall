# Cisco Meraki

Read-only international **Cisco Meraki Dashboard API v1** recipe for `api.meraki.com`. Generate a Dashboard API key under Organization → API & Webhooks → API keys and access and store it as `apiKey`. Requests send `X-Cisco-Meraki-API-Key` plus `Accept: application/json`.

The host is the pinned official global API at `https://api.meraki.com/api/v1`, not a caller-supplied store or shard. Canada (`api.meraki.ca`), India (`api.meraki.in`), and China (`api.meraki.cn`) dashboard hosts are omitted.

## Operations

- `healthcheck`: `GET /api/v1/organizations?perPage=3` (cheap authenticated org list; same path as the pinned credential validator).
- `organizations.list`: `GET /api/v1/organizations` with optional `perPage`, `startingAfter`, and `endingBefore`.
- `networks.list`: `GET /api/v1/organizations/{organizationId}/networks` with required `organizationId` and optional filters/pagination.
- `devices.get`: `GET /api/v1/devices/{serial}`.

Inventory list and writes are omitted. Array query filters (`tags`, `productTypes`) are omitted. Successful responses are raw provider JSON under AppCall `data` (organization/network lists are JSON arrays).

## Adaptations

Pinned source and official docs agree on `https://api.meraki.com/api/v1`. Official docs also document `Authorization: Bearer`; native keeps the pinned `X-Cisco-Meraki-API-Key` header. Native category is `dev-tools` (source Developer Tools / Security; Security is not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent and GET `Content-Type`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.cisco.com/meraki/api-v1/getting-started/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the Dashboard API key, call `healthcheck` with `{}`, then `organizations.list`.
