# Aviationstack

**HOLD.** Official international Aviationstack REST recipe at `https://api.aviationstack.com/v1`. Configure an access key from the APILayer dashboard. The runner would send the `access_key` query parameter plus `Accept: application/json`.

Pinned OpenConnector actions are all quota-consuming aviation-data lookups. There is no cheap account/status/quota GET. The native credential validator is billed `GET /v1/airports?limit=1`. Official pricing counts each successful aviation-data delivery as one monthly request (free plan 100/month). Billable lookup is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `flights.search`, `routes.search`. Catalog helpers (`list_airports` and siblings) are omitted because they are not statically extractable named `defineProviderAction` literals. HTTP 200 bodies with a populated `error` object are demoted via `bodyErrorPaths`. Native category is `utility` (source Data/Developer Tools).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.apilayer.com/aviationstack/docs/getting-started. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
