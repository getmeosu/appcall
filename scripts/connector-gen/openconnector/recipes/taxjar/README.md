# TaxJar

International **TaxJar Sales Tax API v2** recipe covering origin healthcheck plus every Composio `TAXJAR_*` HTTP tool (21 tools, 22 operations; healthcheck is an authenticated `GET /categories` probe and is not a Composio slug).

Generate an API token under Account → API Access and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>`, `Accept: application/json`, and `x-api-version: 2022-01-24` to `https://api.taxjar.com/v2`.

## Operations

- Auth: `healthcheck` (`GET /categories`).
- Categories: `categories.list` (`GET /categories`, TAXJAR_LIST_TAX_CATEGORIES).
- Taxes: `taxes.calculate` (`POST /taxes`, billed calculation).
- Rates: `rates.get` (`GET /rates/{zip}`, billed lookup), `summary.rates.list` (`GET /summary_rates`).
- Nexus: `nexus.regions.list` (`GET /nexus/regions`).
- Customers: `customers.list`, `customers.get`, `customers.create`, `customers.update`, `customers.delete`.
- Orders: `orders.list`, `orders.get`, `orders.create`, `orders.update`, `orders.delete`.
- Refunds: `refunds.list`, `refunds.get`, `refunds.create`, `refunds.update`, `refunds.delete`.
- Validations: `validations.vat` (`GET /validation?vat=`).

Address validation (`POST /addresses/validate`) is omitted because it is not a Composio TAXJAR tool. Successful responses are raw TaxJar JSON under AppCall `data`. Optional query/body fields are omitted when unset. Path identifiers keep origin camelCase (`customerId`, `transactionId`); request bodies use official TaxJar snake_case. `POST /taxes` and `GET /rates/{zip}` count toward billed API transactions.

## Adaptations

Pinned source and official docs agree on Bearer auth, `/v2`, and `x-api-version: 2022-01-24`. Native category is `accounting`. The upstream user-agent and GET `Content-Type` are not sent. Historical 2022 HackerOne account-takeover bugs on `app.taxjar.com` are recorded as remediated.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.taxjar.com/api/reference/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
