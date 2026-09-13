# NinjaPear

Read-only international **NinjaPear B2B Company Intelligence API** recipe. Create an API key in the NinjaPear dashboard at https://nubela.co/dashboard and store it as `apiKey`. Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://nubela.co`.

## Operations

- `healthcheck`: `GET /api/v1/meta/credit-balance` with empty input (documented free credit probe; pinned credential validator). Not customer/competitor listing.
- `credit_balance.get`: same free `GET /api/v1/meta/credit-balance`.
- `disposable_email.check`: free `GET /api/v1/contact/disposable-email`; `email` is required.
- `company.website.lookup`: `GET /api/v1/company/website`; required `company_name`, optional `country_code` and `hint`.
- `company.details.get`: `GET /api/v1/company/details`; required `website`, optional `include_employee_count`, `follower_count` (`include`), `addresses` (`hq-only`|`best-effort-exhaustive`), and `use_cache`.

Successful responses are raw provider JSON under AppCall `data`. Customer/competitor/product listing, employee search, funding, and writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://nubela.co` and Bearer auth. Native category is `crm` (source Data/Marketing are not in the Rust CATEGORIES allowlist). Healthcheck uses the free credit-balance endpoint rather than billed listing. Official company-details docs also accept `socmed_url`; native requires `website` because the pinned handler always sends `website`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
