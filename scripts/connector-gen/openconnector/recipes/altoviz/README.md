# Altoviz

Read-only Altoviz REST API v1 recipe. Configure an API key from Altoviz Settings > API access. The runner sends `x-api-key` to `https://api.altoviz.com`.

Selected operations are `healthcheck` (`GET /v1/customers?PageIndex=1&PageSize=1`), `customers.list`, `customers.get`, and `customers.find`. Customer create/update/delete and the pinned `GET /v1/Users/me` validator (not a listed action) are omitted. Official OpenAPI paths are lowercase; native follows that document rather than the pinned PascalCase paths.

Native category is `accounting` (source Finance/Productivity).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.altoviz.com/ and https://developer.altoviz.com/openapi.json. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure `apiKey`, call `healthcheck` with `{}`, then `customers.list`.
