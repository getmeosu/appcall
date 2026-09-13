# HelpDesk

Read-only HelpDesk.com REST API v1 recipe for Text S.A. (formerly LiveChat Software S.A., Wrocław). This is the HelpDesk.com ticketing product at `www.helpdesk.com` / `api.helpdesk.com`, not Freshdesk, Zendesk, or a generic helpdesk alias.

Configure the HelpDesk account ID (non-secret) and a Personal Access Token from the LiveChat Developers Console (Tools → Personal Access Tokens; `accounts--my:ro` is the documented read scope). The runner sends HTTP Basic authentication with account ID as username and the token as password to `https://api.helpdesk.com`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /v1/agents`), `tickets.list` (optional `status`, `silo`, `pageSize`, `order`, `sortBy`), `tickets.get`, `agents.list`, and `teams.list`. Ticket create/update/delete, silo moves, and OAuth2 authorization-code are omitted. Array filters (`teamIDs[]`, `tagIDs[]`), `hasAssignee` Y/N encoding, and `next`/`prev` cursor objects are omitted because the native query template cannot match the pinned source encodings.

Adaptations versus the pinned OpenConnector source: native Basic auth uses `http.auth.basic`; the pinned credential validator uses `GET /v1/licenses`, while native healthcheck lists agents as a cheap defined-action read; official docs advise a User-Agent because intermediary services may block requests without it, but native omits the upstream user-agent like other recipes; responses keep raw HelpDesk JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.helpdesk.com/ and https://developers.livechat.com/docs/authorization/authorizing-api-calls/#personal-access-tokens. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure both setup fields, call `healthcheck` with `{}`, then `tickets.list`.
