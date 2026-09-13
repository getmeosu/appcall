# SupportBee

Read-only international SupportBee REST API recipe. Copy the API token from your SupportBee desk (profile picture → API Token) and set `company` to the desk subdomain from `https://<company>.supportbee.com`. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://<company>.supportbee.com`. Self-hosted or caller-supplied hosts are not admitted; the host is the stored company subdomain plus the bounded `*.supportbee.com` wildcard.

## Operations

- `healthcheck`: `GET /users` with empty input (pinned credential validator).
- `tickets.list`: `GET /tickets` with optional `per_page` (1–99), `page`, `archived` (`true` / `false` / `any`), `spam`, `trash`, `replies`, `max_replies`, `assigned_user`, `assigned_team`, `label`, `since`, `until`, `sort_by`, and `total_only`.
- `tickets.get`: `GET /tickets/{id}`.
- `labels.list`: `GET /labels`.
- `teams.list`: `GET /teams` with optional `with_users` and `user=me`.

Writes, replies, comments, ticket search, and `requester_emails` (source comma-join) are omitted. Native returns raw SupportBee JSON under `data`. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source and official docs agree on Bearer auth and `https://{company}.supportbee.com`. Required stored `company` interpolates that host with allowlisted `*.supportbee.com` (Algolia/Grafana-style). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://supportbee.com/docs/api/api and https://supportbee.com/docs/api/reference. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
