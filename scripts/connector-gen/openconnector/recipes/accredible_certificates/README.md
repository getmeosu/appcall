# Accredible

Read-only international Accredible Credential API recipe for Accredible (Mountain View, California). Copy an API key from the Accredible dashboard (API Management). The runner sends `Authorization: Token token=<key>` and `Accept: application/json` to `https://api.accredible.com`.

## Operations

- `healthcheck`: `GET /v1/issuer/details` with empty input (pinned credential validator; cheap issuer read).
- `groups.list`: `GET /v1/issuer/all_groups` with optional `page` and `pageSize` (`page_size`).
- `groups.get`: `GET /v1/issuer/groups/{groupId}`.
- `credentials.list`: `GET /v1/all_credentials` with optional `page` and `pageSize` (`page_size`).
- `credentials.get`: `GET /v1/credentials/{id}`.

Search POSTs, credential create/delete, EU host `eu.api.accredible.com`, and sandbox `sandbox.api.accredible.com` are omitted. Native returns raw Accredible JSON under `data`.

## Adaptations

Pinned source and official OpenAPI agree on `Token token=` and the US production host. Native category is `productivity` (source Productivity/Data; Rust CATEGORIES has no `data` bucket). The upstream user-agent and unconditional `Content-Type` are not sent on these GETs.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache License 2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.api.accredible.com/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
