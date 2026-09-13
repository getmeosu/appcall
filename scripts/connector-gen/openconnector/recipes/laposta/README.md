# Laposta

Read-only international **Laposta v2 API** recipe. Create an API key from Access & Subscription > Links - API (Koppelingen) and store it as `apiKey`. Requests send HTTP Basic authentication (API key as username, empty password) and `Accept: application/json` to `https://api.laposta.org`.

## Operations

- `healthcheck`: `GET /v2/list` with empty input (cheap authenticated list; pinned credential validator).
- `lists.list`: `GET /v2/list` with empty input.
- `lists.get`: `GET /v2/list/{list_id}` with required `list_id`.
- `members.list`: `GET /v2/member` with required `list_id` and optional `state` (`active`, `unsubscribed`, `cleaned`).
- `members.get`: `GET /v2/member/{member_id}?list_id={list_id}` with required `list_id` and `member_id` (member ID or email).

Successful responses are raw provider JSON under AppCall `data`. Form-encoded create/update writes are omitted.

## Adaptations

Official English Default API URL is `https://api.laposta.org/`. Pinned source used `https://api.laposta.nl`; native follows the official English host. Native category is `email-marketing` (source Marketing/Communication are not in the Rust CATEGORIES allowlist). Pinned source double-encodes `+` in member emails as `%252B`; native `encodeURIComponent` encodes `+` once as `%2B`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
