# DiscoLike

Read-only international DiscoLike REST API recipe pinned to `api.discolike.com`. Configure an API key from https://app.discolike.com/account/management/keys. The runner sends `X-API-Key` to `https://api.discolike.com/v1`. HTML docs currently show `x-discolike-key` as an alias; this recipe follows the OpenAPI security scheme and the pinned source (`X-API-Key`).

Covered operations: credential-only `healthcheck` (`GET /v1/usage`), `usage.get`, `companies.get` (`GET /v1/bizdata`), `scores.get`, and `growth.get`. Discover/count are omitted: they are billable search and native query objects cannot emit exploded repeated filter keys. Deprecated `/metrics` is omitted.

Native category is `crm`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.discolike.com/api/access/ and https://api.discolike.com/v1/openapi.json. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `companies.get` with a domain.
