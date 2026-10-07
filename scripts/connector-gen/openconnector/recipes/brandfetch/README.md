# Brandfetch

Brandfetch Brand API v2 recipe for Brandfetch (Savigny, Vaud, Switzerland). Create an API key in the Brandfetch developer dashboard. The runner sends `Authorization: Bearer` to `https://api.brandfetch.io`, plus `Accept: application/json`. GraphQL operations use the same Bearer key against `https://graphql.brandfetch.io`.

Covered operations: credential-only `healthcheck` (`GET /v2/brands/brandfetch.com`, official free sandbox), `viewer.get`, typed Brand API lookups (`brands.get`, `brands.getByDomain`, `brands.getByTicker`, `brands.getByIsin`, `brands.getByCrypto`), `brands.context`, `transactions.resolve`, `brands.search`, `agents.accessOffer`, and `graphql.query`. Lookups other than `brandfetch.com` consume Brand API credits; do not use them as a healthcheck.

Adaptations versus the pinned OpenConnector source: native follows current official Transaction API path `/v2/brands/transaction`; native sends `countryCode` as provided; native omits `maxLength` because strict-generated schemas reject it; native category is `utility`; the upstream user-agent is not sent. Responses keep raw Brandfetch JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.brandfetch.com/reference/brand-api. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `viewer.get` with `{}`.
