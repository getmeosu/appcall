# Nango

Read-only Nango Cloud REST recipe for Nango Inc (United States). Configure an environment API key from Environment Settings > API Keys. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.nango.dev`. Self-hosted Nango is a different edition and is not this recipe.

Selected operations are `healthcheck` (`GET /providers`), `providers.get` (`GET /providers/{provider}`), `integrations.list` (`GET /integrations`), and `connections.list` (`GET /connections` with optional `connectionId`, `search`, `limit`, and `page`). Healthcheck uses the documented provider catalog probe rather than billed search. Connection writes, credential-bearing get-connection, and object `tags` query filters are omitted.

Adaptations versus the pinned OpenConnector source: nested `tags[key]` query encoding is omitted because it is not native-template-safe; list responses keep the raw JSON under `data`; native category is `dev-tools` (source Developer Tools/Data are not both in native CATEGORIES); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://nango.dev/docs/reference/backend/http-api/api-keys. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an environment API key, call `healthcheck` with `{}`, then `integrations.list`.
