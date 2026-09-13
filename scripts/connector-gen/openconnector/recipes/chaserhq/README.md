# ChaserHQ

Read-only international Chaser Open API recipe. Copy the API key and API secret from Organisation Settings → Integrations → Get API keys. The runner sends HTTP Basic authentication with the API key as username and the API secret as password to `https://openapi.chaserhq.com`.

## Operations

- `healthcheck`: `GET /v1/organisation` with empty input (pinned credential validator).
- `customers.list`: `GET /v1/customers` with optional `limit` (1–100) and zero-based `page`.
- `customers.get`: `GET /v1/customers/{customerId}`.
- `invoices.list`: `GET /v1/invoices` with optional `limit` and `page`.
- `invoices.get`: `GET /v1/invoices/{invoiceId}`.

Writes, invoice-history endpoints, nested `filter[...]` query objects, and `additional_fields` comma-joins are omitted. Native returns raw Chaser JSON under `data`. Native category is `accounting` (source Finance is not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source and official docs agree on HTTP Basic and the fixed host `openapi.chaserhq.com`. Native Basic uses `http.auth.basic` rather than a handwritten header. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://help.chaserhq.com/chaserapi and https://openapi.chaserhq.com/docs/static/index.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
