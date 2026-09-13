# Booqable

Read-only Booqable API v4 recipe for the international rental product. Store a company slug (the subdomain before `.booqable.com`) and an access token created in account settings. Requests use `https://{companySlug}.booqable.com/api/4` with `Authorization: Bearer` and `Accept: application/json`. The slug is a required stored setup field; hosts are bounded to `*.booqable.com`.

## Operations

- `healthcheck`: `GET /companies/current` with empty input.
- `customers.list`: `GET /customers` with optional `include`, `pageNumber` (`page[number]`), `pageSize` (`page[size]`), and `sort`.
- `customers.get`: `GET /customers/{customerId}`; `customerId` is percent-encoded.
- `orders.list`: `GET /orders` with the same optional list query as customers.
- `productGroups.list`: `GET /product_groups` with the same optional list query.

Nested `fields` / `filter` / `meta` / `extra_fields` query-object fanout and advanced-search POST bodies from the pinned helper are omitted. Successful responses are preserved as raw provider JSON under AppCall `data`.

## Testing and live smoke

Fixtures are supplied evidence only. They cover success, unauthorized 401, missing `customerId`, and an extra healthcheck field. Fixtures do not prove live credentials. For live smoke, use a least-privilege access token, invoke `healthcheck`, then list customers/orders/product groups.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
