# Daffy

Read-only international **Daffy Public API v1** recipe. Daffy is a US donor-advised fund operated by Daffy Charitable Fund, a 501(c)(3) public charity (EIN 86-3177440) in Los Altos, California.

## Setup

Create an API key from https://www.daffy.org/settings/api (shown once). Store it as `apiKey`. Requests send `X-Api-Key: <key>` and `Accept: application/json` to `https://public.daffy.org/v1`.

## Operations

- `healthcheck`: `GET /v1/users/me` with empty input (cheap authenticated profile read; pinned credential validator and official getting-started example).
- `users.me`: same `GET /v1/users/me`.
- `users.get`: `GET /v1/users/{username}`; `username` is a required string path segment.
- `balance.get`: `GET /v1/users/me/balance`.
- `donations.list`: `GET /v1/donations` with optional 1-indexed `page`.

Successful responses are raw provider JSON under AppCall `data`. Donation/contribution writes, nonprofit search, and other-user donation fanout are omitted.

## Adaptations

Pinned source and official docs agree on `https://public.daffy.org/v1` and the `X-Api-Key` header. Official GET examples do not send `Content-Type`; this recipe omits it. Native category is `payments` (source Finance is not in the Rust CATEGORIES allowlist; fundraising/DAF giving maps to payments).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
