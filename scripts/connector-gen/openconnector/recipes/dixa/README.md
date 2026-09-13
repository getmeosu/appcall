# Dixa

Read-only international Dixa API v1 recipe pinned to `dev.dixa.io`. Administrators create an API token under Settings > Manage > Integrations > API Tokens. The runner sends `Authorization: Bearer` to `https://dev.dixa.io`.

Covered operations: credential-only `healthcheck` (`GET /v1/agents?pageLimit=1`), `agents.list`, `agents.get`, `presence.list`, and `endusers.list`. Cursor pagination is caller-controlled via `pageKey`; provider `meta.next` links are never followed. Conversation and message reads are not exposed. Source always sends `Content-Type` on GET; native GET omits it because there is no body.

Native category is `messaging`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.dixa.io/docs/api-standards-rules and https://docs.dixa.io/openapi/dixa-api/v1/agents/getagents.md. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `agents.list`.
