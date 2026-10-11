# WorkOS

International WorkOS REST API recipe covering origin healthcheck plus every Composio `WORKOS_*` HTTP tool (29 tools, 30 operations; healthcheck is extra).

## Setup

Configure a secret API key (`sk_…`) from the WorkOS Dashboard. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.workos.com`.

## Operations

- Auth: `healthcheck` (`GET /organizations?limit=1`).
- Organizations: list, get (WorkOS ID, `organization_id` alias, or `external_id`), create, update, delete.
- Users: list, get (WorkOS ID, `user_id` alias, or `external_id`), create (passwordless), update, delete.
- Organization memberships: list, get, create, update roles, set status (activate/deactivate), delete.
- Connections and directories: list and get.
- Directory groups and users: list (Composio `directory_id` / `directory_user_id` / `directory_group_id` map to official `directory` / `user` / `group`) and get.
- Invitations: list, get, send, resend, revoke. `token` and `accept_invitation_url` are redacted.

Successful JSON responses are raw WorkOS JSON under AppCall `data`. DELETE maps empty or JSON bodies to `{success: true}`. Composio `next_cursor` is aliased to official `after`. Optional query/body fields are omitted when unset. The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://workos.com/docs/reference. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
