# Eventzilla

Read-only international **Eventzilla API v2** recipe. Organizers create an API key under Settings > Developers > API Credentials (pinned source still says Settings > App Management). Store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://www.eventzillaapi.net/api/v2`.

## Operations

- `healthcheck`: `GET /users?offset=0&limit=1` with empty input (cheap authenticated organizer probe; pinned credential validator).
- `events.list`: `GET /events` with optional `offset` (≥0), `limit` (1–100), `status`, and `category`.
- `events.get`: `GET /events/{eventid}`; `eventid` is a required positive integer.
- `tickets.list`: `GET /events/{eventid}/tickets`.
- `users.get`: `GET /users/{userid}`; `userid` is a required positive integer.

Successful responses are raw provider JSON under AppCall `data`. Checkout, check-in, order confirm/cancel, and other writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://www.eventzillaapi.net/api/v2` and the `x-api-key` header. Native category is `scheduling` (source Productivity/Marketing are not in the Rust CATEGORIES allowlist). Healthcheck uses the validator's `/users?offset=0&limit=1` rather than a search. Official list-users has no required query; the validator always pages. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
