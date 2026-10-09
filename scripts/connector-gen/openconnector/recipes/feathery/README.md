# Feathery

International **Feathery US REST API** recipe covering origin healthcheck plus every Composio `FEATHERY_*` HTTP tool (19 tools, 20 operations; healthcheck is an authenticated `GET /api/account/` probe and is not a Composio slug). `account.get` is the Composio mapping for the same retrieve-account endpoint.

Create an admin API key in Feathery developer settings. The runner sends `Authorization: Token <apiKey>` to `https://api.feathery.io`. This recipe pins the documented US default host. Official regional hosts (`api-ca.feathery.io`, `api-eu.feathery.io`, `api-au.feathery.io`) are not caller-supplied.

## Operations

- Auth: `healthcheck` (`GET /api/account/`).
- Account: `account.get`, `account.edit`.
- Forms: `forms.list`, `forms.get`, `forms.delete`.
- Hidden fields: `hidden-fields.list`, `hidden-fields.create`.
- Documents: `documents.fill`, `documents.envelopes.list`.
- Logs: `logs.api-connector-errors.list`, `logs.emails.list`, `logs.email-issues.list`, `logs.quik-requests.list`.
- Users: `users.list`, `users.create-or-fetch`, `users.data.get`, `users.session.get`, `users.delete`.
- Workspaces: `workspaces.login-token.generate`.

Successful JSON responses are raw Feathery JSON under AppCall `data`. List endpoints that return JSON arrays use `outputSchema.data` as array. Official empty DELETE bodies (`forms.delete`, `users.delete`) map to `{success: true}`. `forms.list` tags are sent as a comma-separated query parameter. `hidden-fields.create` maps Composio `field_id` to official `id`. `account.edit` wraps the object in the official JSON array body. Optional query/body fields are omitted when unset. The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api-docs.feathery.io/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke remains unverified.
