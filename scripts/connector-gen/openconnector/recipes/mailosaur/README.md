# Mailosaur

Read-only international **Mailosaur email and SMS testing API** recipe. Create an API key in the Mailosaur Dashboard. Store it as `apiKey`. The runner sends HTTP Basic authentication with username `api` and the API key as password to `https://mailosaur.com`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /api/servers` with empty input (cheap authenticated server list; pinned credential validator).
- `servers.list`: `GET /api/servers`.
- `servers.get`: `GET /api/servers/{id}`; `id` is a required non-empty string.
- `messages.list`: `GET /api/messages`; required `server` query plus optional `receivedAfter`, `page`, `itemsPerPage` (1–1000), and `dir` (`Received`|`Sent`).
- `usage.limits.get`: `GET /api/usage/limits` (account-level API key).

Successful responses are raw provider JSON under AppCall `data`. Server/message writes, search, and OTP generation are omitted.

## Adaptations

Official curl uses `-u api:YOUR_API_KEY`. Native Basic uses `http.auth.basic` with literal username `api` and the API key as password, matching pinned `buildMailosaurAuthorization`. Prose that describes the API key as the username with an empty password is not used because it contradicts the official curl example. Native category is `dev-tools` (email/SMS testing; no testing/qa CATEGORIES value). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
