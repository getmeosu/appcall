# Have I Been Pwned

Read-only international **Have I Been Pwned API v3** recipe at `https://haveibeenpwned.com/api/v3`. Account-search and paste-search endpoints are omitted because they are billable, rate-limited lookups rather than cheap catalogue reads.

## Setup

Buy or view an API key at [haveibeenpwned.com/API/Key](https://haveibeenpwned.com/API/Key). Store it as `apiKey`. Requests send `hibp-api-key`, `Accept: application/json`, and `User-Agent: appcall-haveibeenpwned` (HIBP returns HTTP 403 without a user agent).

## Operations

- `healthcheck`: `GET /subscription/status` with empty input (pinned credential probe; not a billable email search).
- `subscription.get`: `GET /subscription/status`.
- `breaches.list`: `GET /breaches` with optional `domain` (query `Domain`) and `isSpamList` (query `IsSpamList`).
- `breaches.get`: `GET /breach/{name}`.
- `latest-breach.get`: `GET /latestBreach`.

Successful responses are raw provider JSON under AppCall `data`. `/breachedAccount` and `/pasteAccount` are omitted.

## Adaptations

Pinned source and official docs agree on host, `hibp-api-key`, and the selected paths. Native sends a static `User-Agent: appcall-haveibeenpwned` instead of the upstream SDK user-agent, because official docs require a user agent. Query names `Domain` and `IsSpamList` match official casing.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
