# WorkOS

Read-only international WorkOS API recipe. Configure a secret API key (`sk_…`) from the WorkOS Dashboard. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.workos.com`.

## Operations

- `healthcheck`: `GET /organizations?limit=1` with empty input (pinned credential validator).
- `organizations.list`: `GET /organizations` with optional `before`, `after`, `limit` (1–100), `order`, and `search`.
- `organizations.get`: `GET /organizations/{id}`.
- `users.list`: `GET /user_management/users` with optional cursor, `limit`, `order`, `organization_id`, and `email`.
- `users.get`: `GET /user_management/users/{id}`.

Writes, memberships, and the `domains` array filter are omitted. Native returns raw WorkOS JSON under `data` instead of unwrapping `{organizations|users, raw}`. Native category is `dev-tools`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://workos.com/docs/reference/api-authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure a secret key, call `healthcheck` with `{}`, then `organizations.list`.
