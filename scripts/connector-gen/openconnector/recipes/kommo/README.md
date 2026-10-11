# Kommo

International **Kommo API v4** recipe covering the Composio KOMMO toolkit (53 tools). Create a private integration and generate a long-lived token from Keys and scopes. Store the token as `apiKey` and the account subdomain as `subdomain`. Requests send `Authorization: Bearer` to `https://<subdomain>.kommo.com`.

Files list/delete use the documented Drive host `https://drive-c.kommo.com` (`GET/DELETE /v1.0/files`). Kommo AI uses `https://airewriter.kommo.com`. Both hosts are covered by `allowedHosts: *.kommo.com`. Discover an account-specific drive via `GET /api/v4/account?with=drive_url`.

## Operations

Origin/main five operations are retained and mapped to Composio:

- `healthcheck`: `GET /api/v4/account` (KOMMO_GET_ACCOUNT). Optional `with_params`.
- `leads.list`: `GET /api/v4/leads` (KOMMO_LIST_LEADS).
- `contacts.list`: `GET /api/v4/contacts` (KOMMO_LIST_CONTACTS).
- `pipelines.list`: `GET /api/v4/leads/pipelines` (KOMMO_LIST_LEADS_PIPELINES).
- `users.list`: `GET /api/v4/users` (KOMMO_LIST_USERS).

The remaining Composio KOMMO tools are request-backed actions on the same v4 host plus Drive and AI hosts (companies, tasks, catalogs, notes, events, files, widgets, webhooks, conversations, templates, unsorted leads, and writes). Recipe operations equal runner operations.

## Adaptations

Create lead/company/task wrap a single Composio object as the official JSON array body. Create contact forwards the `contacts` array as-is. Update tools PATCH `/api/v4/{entity}/{id}` with an object body. Composio `tags_to_add` maps to official `_embedded.tags`. List filters use official `filter[id][]` / `order[updated_at]` query names. Empty collections may return HTTP 204 (accepted on list ops). Files API is pinned to `drive-c` as documented; accounts on another drive need that host. Native category is `crm`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.kommo.com/docs/long-lived-token and https://developers.kommo.com/reference/account-parameters. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
