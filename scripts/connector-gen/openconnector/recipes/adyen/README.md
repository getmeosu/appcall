# Adyen

Read-only international Adyen Management API v3 recipe. Generate a Management API key in the Adyen Customer Area and set environment to `test` or `live`. The runner sends `X-API-Key` to `https://management-{{environment}}.adyen.com/v3`. Hosts other than `management-test.adyen.com` and `management-live.adyen.com` are rejected.

Covered operations: credential-only `healthcheck` (`GET /me`), `companies.list`, `companies.get`, `merchants.list`, and `merchants.get`. Writes, terminal ordering, webhook mutation, and company-scoped merchant lists are omitted.

Adaptations versus the pinned OpenConnector source: required stored `environment` interpolates the official test and live Management hosts rather than computing the host in code; native category is `payments` rather than Finance; responses are raw Adyen JSON under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.adyen.com/development-resources/api-credentials#generate-api-key. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
