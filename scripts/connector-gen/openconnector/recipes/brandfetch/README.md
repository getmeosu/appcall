# Brandfetch

Read-only Brandfetch Brand API v2 recipe for Brandfetch (Savigny, Vaud, Switzerland). Create an API key in the Brandfetch developer dashboard. The runner sends `Authorization: Bearer` to `https://api.brandfetch.io`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /v2/brands/brandfetch.com`, official free sandbox), `brands.get` (`GET /v2/brands/{identifier}`), and `transactions.resolve` (`POST /v2/brands/transaction`). Lookups other than `brandfetch.com` consume Brand API credits; do not use them as a healthcheck. Official `GET /v2/viewer` is free but is not a pinned upstream action, so it is not fabricated.

Adaptations versus the pinned OpenConnector source: native follows current official Transaction API path `/v2/brands/transaction` rather than pinned `/v2/transactions`; native sends `countryCode` as provided (pinned source uppercases it); native omits `maxLength` because strict-generated schemas reject it; native category is `utility` (source Design & Media / Marketing are not in Rust CATEGORIES); the upstream user-agent is not sent. Responses keep raw Brandfetch JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.brandfetch.com/reference/brand-api. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `brands.get` with `{ "identifier": "brandfetch.com" }`.
