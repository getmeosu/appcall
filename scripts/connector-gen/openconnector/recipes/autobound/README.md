# Autobound

Read-only international **Autobound Signal API** recipe. Create an API key at https://signalapi.autobound.ai and store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://signals.autobound.ai`.

## Operations

- `healthcheck`: `GET /v1/account` (free authenticated read; same path as the pinned credential validator).
- `account.get`: `GET /v1/account`.
- `signal-types.list`: `GET /v1/signals/types` with optional query `include_counts`, `association` (`company`|`contact`), and `since`. Official credit cost is free.

Successful responses are raw provider JSON under AppCall `data`. Billed company/contact enrich and search POSTs (2 credits per result) are omitted.

## Adaptations

Pinned source and official docs agree on `https://signals.autobound.ai` and `x-api-key`. Official also documents `Authorization: Bearer`; native follows the pinned header. Native category is `crm` (source Data/Marketing are not both in the Rust CATEGORIES allowlist). Current official account JSON uses a nested `credits` object; native returns that raw body rather than the upstream `credit_balance` reshape.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
