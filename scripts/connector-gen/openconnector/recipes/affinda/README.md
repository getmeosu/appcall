# Affinda

International Affinda REST API v3 recipe. Configure an API key from user settings and the API region slug from the Affinda web app host: `api` (AUS/Global), `api.us1` (US), or `api.eu1` (EU). The runner sends `Authorization: Bearer` to `https://<region>.affinda.com`.

Covered operations: credential-only `healthcheck` and `organizations.list` (`GET /v3/organizations`), `organizations.get`, `workspaces.list|get|create|update|delete`, `document-types.list|get`, `documents.list|get|update|delete`, `tags.list|get|create`, `usage.get`, and `resthooks.list|get`. Multipart document upload remains omitted because the declarative engine does not emit multipart bodies.

Caller-supplied `apiBaseUrl` is replaced by required stored `region` interpolating `https://{{region}}.affinda.com` with allowlisted official hosts only. Docs prose says "basic authentication"; OpenAPI and the pinned source use `Authorization: Bearer`. Native category is `utility` (source AI/Data are not in native CATEGORIES). The upstream user-agent is not sent. Responses keep raw Affinda JSON under `data`. Resthook list/get cover webhook subscription management; inbound EventOnly document events are not compiled as recipe actions.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.affinda.com/reference/authentication and https://docs.affinda.com/api-reference/organizations/get-list-of-all-organizations. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key and region, call `healthcheck` with `{}`, then `organizations.list`.
