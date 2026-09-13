# Instabot

Read-only Instabot Server API v1 recipe. Copy the API key and Master API key from the Instabot portal (Account Settings) and store them as `apiKey` and `masterApiKey`. Requests send `X-Instabot-Api-Key`, `Authorization: X-Instabot-Master-Api-Key`, and `Accept: application/json` to `https://api.instabot.io/v1`.

## Operations

- `healthcheck`: `GET /` (cheap authenticated application probe; matches pinned credential validation). Native joins `https://api.instabot.io/v1` + `/`, producing `https://api.instabot.io/v1/`.
- `users.list`: `GET /users?type=all` with optional `limit`, `skip`, `orderBy`, and `getTotalCount`.
- `users.get`: `GET /users/{userId}`.
- `users.updated.list`: `GET /users/lastUpdated` with required `since` (pinned source path; official object-search docs do not list it).

Successful responses are raw provider JSON under AppCall `data`. Create, update, delete, and restore user writes are omitted.

## Adaptations

Pinned source and official docs agree on dual-key Master API headers and `/v1` paths. Native category is `messaging` (source Marketing/Communication are not in the Rust CATEGORIES allowlist). Official JSON bodies include `apiStatusCode` `Success`; native `bodyErrorPaths` use a non-empty `apiStatusMessage` because `apiStatusCode=Success` would trip a string path. Docs say `apiStatusMessage` is omitted on success.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
