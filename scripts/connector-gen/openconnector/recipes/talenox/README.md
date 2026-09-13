# Talenox

Read-only international **Talenox API v2** recipe. Talenox is the Singapore HR/payroll product at [talenox.com](https://www.talenox.com/). Generate an API token in the top-right navigation under API setting at [app.talenox.com](https://app.talenox.com) and store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.talenox.com/api/v2`.

## Operations

- `healthcheck`: `GET /company_settings` (cheap authenticated company settings read).
- `branches.list`: `GET /branches`.
- `branches.get`: `GET /branches/{id}`; `id` is a required positive integer.
- `employees.list`: `GET /employees`.
- `employees.get`: `GET /employees/{id}`; `id` is a required positive integer.

Successful responses are raw Talenox JSON under AppCall `data`. List endpoints return JSON arrays. Writes, payroll mutation, leave beta, and OAuth 2.0 are omitted.

## Adaptations

Pinned source and official docs agree on Bearer auth and `/api/v2` paths. Native category is `productivity`. The upstream user-agent and GET `Content-Type` are not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://talenox.github.io/api-doc/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
