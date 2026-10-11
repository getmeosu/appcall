# Callingly

International **Callingly REST API** recipe covering origin healthcheck plus every Composio `CALLINGLY_*` HTTP tool (29 tools, 30 operations; healthcheck is an authenticated `GET /v1/teams` probe and is not a Composio slug).

Create a bearer token under Settings > API Keys and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.callingly.com`.

## Operations

- Auth: `healthcheck` (`GET /v1/teams`).
- Teams: `teams.list`, `teams.get`, `teams.create`.
- Team agents: `teams.agents.list`, `teams.agents.update`, `teams.agents.update_settings`, `teams.agents.remove`.
- Leads: `leads.list`, `leads.get`, `leads.update`, `leads.delete`.
- Calls: `calls.list`, `calls.get`, `calls.create`.
- Clients: `clients.list`, `clients.create`, `clients.delete`, `clients.activate`.
- Agents: `agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.schedule.get`, `agents.schedule.update`.
- Webhooks: `webhooks.list`, `webhooks.get`, `webhooks.create`, `webhooks.update`, `webhooks.delete` (outbound registration; Composio triggers = 0).

Successful JSON responses are raw Callingly JSON under AppCall `data`. List endpoints that return JSON arrays use `outputSchema.data` as array or object. Undocumented DELETE bodies (`agents.delete`, `clients.delete`, `teams.agents.remove`) map to `{success: true}`. `webhooks.create` maps Composio `direction` to official `call_direction`. Optional query/body fields are omitted when unset. The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://help.callingly.com/article/38-callingly-api-documentation. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
