# Booqable

Booqable API v4 recipe for the international rental product. Store a company slug (the subdomain before `.booqable.com`) and an access token created in account settings. Requests use `https://{companySlug}.booqable.com/api/4` with `Authorization: Bearer` and `Accept: application/json`. The slug is a required stored setup field; hosts are bounded to `*.booqable.com`.

## Operations

- `healthcheck`: `GET /companies/current` with empty input.
- `customers.list`: `GET /customers` with optional `include`, `pageNumber` (`page[number]`), `pageSize` (`page[size]`), and `sort`.
- `customers.get`: `GET /customers/{customerId}`; `customerId` is percent-encoded.
- `orders.list`: `GET /orders` with the same optional list query as customers.
- `productGroups.list`: `GET /product_groups` with the same optional list query.

- `customers.create` / `customers.delete`: JSON:API `POST`/`DELETE /customers`.
- `orders.create` / `orders.delete` / `orders.get` / `orders.new`: order writes plus `GET /orders/{id}` and `GET /orders/new`.
- `productGroups.create` / `productGroups.delete` / `productGroups.get`: product-group writes and fetch.
- List/search coverage for barcodes, bundle items, clusters, coupons, documents, employees, inventory, items, lines, locations, notes, payments, photos, plannings, products, properties, provinces, stock items, tax rates, users, and related JSON:API collections.
- `companies.update`: `PUT /companies/current`.
- Advanced search tools POST to `/{resource}/search` with JSON:API filter/fields bodies.


JSON:API `filter[field]`, `page[number]`, `page[size]`, and `fields[type]` query keys are expressed as native templates. Advanced search POSTs send JSON:API `fields`/`filter` bodies. Successful responses are preserved as raw provider JSON under AppCall `data`. Origin list/get shapes (`pageNumber`/`pageSize`/`customerId`) are unchanged.

## Testing and live smoke

Fixtures are supplied evidence only. They cover success, unauthorized 401, missing `customerId`, and an extra healthcheck field. Fixtures do not prove live credentials. For live smoke, use a least-privilege access token, invoke `healthcheck`, then list customers/orders/product groups.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
