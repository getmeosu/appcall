# Amplemarket

Read-only international Amplemarket REST API recipe. Create an API key under Settings > API in the Amplemarket Dashboard and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.amplemarket.com`.

## Operations

- `healthcheck` / `account.get`: `GET /account-info` (cheap authenticated account read; not a billed people-search or enrichment).
- `lead-lists.list`: `GET /lead-lists` with optional `pageSize` (1–100), `pageAfter`, `pageBefore`, `status`, `ownerId`, `ownerEmail`.
- `tasks.list`: `GET /tasks` with optional cursor pagination and status/type/user filters.
- `task-statuses.list`: `GET /tasks/statuses`.

People search, person/company enrichment, email validation, contact lookups, sequence enrollment, and task complete/skip writes are omitted. Successful responses are raw provider JSON under AppCall `data`. Provider next links are never followed.

## Adaptations

Native category is `crm` (source Marketing/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent. `GET /account-info` is returned under `data` rather than the pinned `{account}` wrapper.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.amplemarket.com/api-reference/introduction and https://docs.amplemarket.com/api-reference/account-info. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified.
