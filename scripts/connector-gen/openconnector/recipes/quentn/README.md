# Quentn

Read-only international **Quentn public API V1** recipe. Quentn is Quentn.com GmbH's email-marketing and CRM product in Potsdam, Germany.

## Setup

Create an API key under Settings → API Info. Store it as `apiKey`. Also store `systemId` and `serverId` from your API hostname (`https://<system_id>.<server_id>.quentn.com/public/api/V1`). Requests send `Authorization: Bearer <key>` and `Accept: application/json`. Allowed hosts are `*.quentn.com`.

## Operations

- `healthcheck`: `GET /users?limit=1` with empty input (cheap authenticated list probe; pinned credential validator).
- `users.list`: `GET /users` with optional `range`, `limit` (1–20), and `sort` (`asc`|`desc`).
- `users.get`: `GET /user/{user_id}`; `user_id` is a required positive integer.
- `contacts.get`: `GET /contact/{contact_id}`; `contact_id` is a required positive integer.
- `terms.list`: `GET /terms` with optional `offset` and `limit` (1–500).

Successful responses are raw provider JSON under AppCall `data`. Writes, email lookup, contact-field projection, and taxonomy mutation are omitted.

## Adaptations

Pinned source and official docs agree on `https://<system_id>.<server_id>.quentn.com/public/api/V1` and Bearer auth. Native host interpolates required stored `systemId` and `serverId` (Algolia/Grafana-style) with `allowedHosts` `*.quentn.com`. Native category is `email-marketing` (source Marketing/Productivity are not both in native CATEGORIES). HTTP 200 bodies with a truthy `error` field are treated as failures (`bodyErrorPaths`). Healthcheck uses the user-list probe rather than a billable search.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
