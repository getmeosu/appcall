# WorkOS

International WorkOS API recipe (v0.2.0). Configure a secret API key (`sk_…`) from the WorkOS Dashboard. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.workos.com`.

## Operations

- `healthcheck`: `GET /organizations?limit=1` with empty input (pinned credential validator).
- Organizations: `organizations.list|get|create|update|delete`.
- Users: `users.list|get|create|update|delete`.
- Memberships: `memberships.list|get|create|update|delete`.
- Invitations: `invitations.list|get|create` and `invitations.revoke`.
- Directories and SSO: `directories.list`, `connections.list`.
- EventOnly webhooks: `webhook.user_created`, `webhook.organization_created`, `webhook.organization_membership_created`, `webhook.invitation_accepted`.

Native returns raw WorkOS JSON under `data`. Native category is `dev-tools`. The upstream user-agent is not sent. The `domains` array filter is omitted because native query templates cannot repeat keys.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://workos.com/docs/reference/api-authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure a secret key, call `healthcheck` with `{}`, then `organizations.list`.
