# Ambivo

Read-only international Ambivo CRM REST API recipe. Generate an integration token at https://account.ambivo.com/integrations and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://fapi.ambivo.com`.

## Operations

- `healthcheck`: `GET /crm/leads?page_size=1&page_num=1` (cheap authenticated probe; pinned credential validator).
- `leads.list`: `GET /crm/leads` with optional `pageSize` (1–500), `pageNum` (≥1), `startDate`, `endDate`.
- `contacts.list`: `GET /crm/contacts` with optional `pageSize`, `startDate`, `endDate` (official contacts list has no `page_num`).
- `tasks.list`: `GET /crm/tasks` with optional `pageSize` and `pageNum`.

Creates, patches, deletes, MongoDB `match_filter_dict` filters, and `/created` polling endpoints are omitted. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Native category is `crm` (source Productivity/Marketing). Native always prefixes `Bearer `; paste the raw token. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://fapi.ambivo.com/docs and https://fapi.ambivo.com/openapi.json. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified.
