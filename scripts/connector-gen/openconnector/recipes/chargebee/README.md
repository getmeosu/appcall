# Chargebee

Read-only international Chargebee API v2 recipe. Create an API key under Settings → Configure Chargebee → API Keys and Webhooks. Set `site` to the Chargebee site name from `https://<site>.chargebee.com` (not a full URL). The runner sends HTTP Basic authentication with the API key as username and an empty password to `https://<site>.chargebee.com/api/v2`.

The host is the required stored site name plus the bounded `*.chargebee.com` wildcard (Algolia/Grafana-style). Caller-supplied full URLs, custom CNAMEs, and non-chargebee.com hosts are not admitted.

## Operations

- `healthcheck`: `GET /customers?limit=1` with empty input (pinned credential validator).
- `customers.list`: `GET /customers` with optional `limit` (1–100) and `offset`.
- `customers.get`: `GET /customers/{customerId}`.
- `subscriptions.list`: `GET /subscriptions` with optional `limit` and `offset`.
- `invoices.list`: `GET /invoices` with optional `limit` and `offset`.

Writes, item-price endpoints, and exact-match filters such as `email[is]` are omitted. Native returns raw Chargebee JSON under `data`. Native category is `payments` (source Finance is not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source accepts a site name or a `*.chargebee.com` URL and normalizes to the site label. Native stores only the site name and interpolates `https://{{site}}.chargebee.com/api/v2`. Native Basic uses a literal empty password rather than a handwritten header. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://apidocs.chargebee.com/docs/api/getting-started and https://apidocs.chargebee.com/docs/api/auth?prod_cat_ver=2. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
