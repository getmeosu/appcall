# Nango

Nango Cloud REST recipe for Nango Inc (United States). Configure an environment API key from Environment Settings > API Keys. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.nango.dev`. Self-hosted Nango is a different edition and is not this recipe.

Selected operations cover the 24 Composio NANGO tools plus origin `healthcheck` (`GET /providers`). `providers.list` is the same catalog probe under the Composio name. `connections.list` covers both `NANGO_LIST_CONNECTIONS` and `NANGO_CONNECTION_GET`. Writes (integrations, connections, metadata, connect sessions, sync trigger, action trigger, proxy PUT) are included as documented HTTP calls.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://nango.dev/docs/reference/backend/http-api/api-keys. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an environment API key, call `healthcheck` with `{}`, then `integrations.list`.
