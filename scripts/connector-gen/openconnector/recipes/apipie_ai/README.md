# APIpie AI

Read-only APIpie AI OpenAI-compatible API recipe for the international product at `apipie.ai`. Configure an API key from https://apipie.ai/profile/api-keys. The runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v1/models`), `models.list`, and `models.details` (`GET /v1/models/details`). Chat completions and embeddings are omitted as billed. Official type/provider query filters are omitted because the pinned list actions have empty input schemas.

Native category is `dev-tools` (source AI / Developer Tools). Operator: Neuronic AI, Incorporated (Dallas, Texas). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apipie.ai/docs. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `models.list`.
