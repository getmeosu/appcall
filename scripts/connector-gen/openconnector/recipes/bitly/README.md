# Bitly

Read-only international **Bitly v4 API** recipe for `api-ssl.bitly.com`. Create a generic access token in Bitly Developer settings and store it as `apiKey`. Requests send `Authorization: Bearer` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v4/user` (cheap authenticated user read; same path as the pinned credential validator).
- `groups.list`: `GET /v4/groups` with optional `organizationGuid` (`organization_guid`).
- `groups.get`: `GET /v4/groups/{groupGuid}`; `groupGuid` is required.

`POST /v4/shorten` and `PATCH /v4/bitlinks/{bitlink}` are omitted as writes. `GET /v4/bitlinks/{bitlink}` is omitted because Bitly bitlink IDs contain a slash and the native path template encodes the whole segment. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api-ssl.bitly.com/v4` and Bearer auth. Native category is `utility` (source Marketing/Data are not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Historical May 2014 offsite-backup exposure is recorded under the 2026-09-13 waiver.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the access token, call `healthcheck` with `{}`, then `groups.list`.
