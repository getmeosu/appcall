# Permit.io

Read-only Permit.io Facts API recipe for Permit.io (Tel Aviv, Israel). Copy an environment, project, or organization API key from https://app.permit.io and store it as `apiKey`. Also store the project id/key as `projectId` and environment id/key as `environmentId` (required stored ids on the fixed host `api.permit.io`). Requests send `Authorization: Bearer <key>` and `Accept: application/json` to `https://api.permit.io`. EU `api.eu.permit.io` and self-hosted PDP URLs are not accepted.

Selected operations are `healthcheck` (`GET /v2/api-key/scope`), `users.list` and `users.get` (`GET /v2/facts/{projectId}/{environmentId}/users[/{userId}]`), and `tenants.list` and `tenants.get` (`GET /v2/facts/{projectId}/{environmentId}/tenants[/{tenantId}]`). Healthcheck uses the documented API-key scope probe and does not list users. Role assignment writes, schema writes, and the PDP check API are omitted.

Adaptations versus the pinned OpenConnector source: native category is `dev-tools` (source Security is not in native CATEGORIES); healthcheck uses GET `/v2/api-key/scope` rather than list_users; projectId and environmentId are required stored setup fields instead of credential-validation metadata; GET omits Content-Type and the upstream user-agent; `include_total_count` is omitted; responses keep raw Permit JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.permit.io/api/api-with-cli/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key plus project/environment ids, call `healthcheck` with `{}`, then `users.list` with `page=1`.
