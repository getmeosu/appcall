# Kustomer

Read-only international **Kustomer customer API** recipe. Create an API key under Settings > Security > API Keys and store it as `apiKey`. Store the organization subdomain as required `orgName`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://{orgName}.api.kustomerapp.com/v1`.

## Operations

- `healthcheck`: `GET /customers?pageSize=1` with empty input (cheap authenticated list).
- `customers.list`: `GET /customers` with optional `sort` (`createdAt`, `-createdAt`, `updatedAt`, `-updatedAt`), `page` (≥1), and `pageSize` (1–100).
- `customers.get`: `GET /customers/{id}` with required `id` and optional `include`.
- `customers.getByEmail`: `GET /customers/email={email}` with required `email` and optional `include`.
- `customers.getByExternalId`: `GET /customers/externalId={externalId}` with required `externalId` and optional `include`.

Successful responses are raw provider JSON under AppCall `data`. Nested createdAt/updatedAt filters, customer search, and writes are omitted.

## Adaptations

Official getting-started host is `https://{orgName}.api.kustomerapp.com`. Pinned source used unscoped `api.kustomerapp.com`; native follows the org subdomain with a required stored `orgName` and `*.api.kustomerapp.com` (Algolia pattern). Native category is `crm` (source Productivity/Data are not in the Rust CATEGORIES allowlist). Pagination `pageSize` maximum is 100 per official pagination docs.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
