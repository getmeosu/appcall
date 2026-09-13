# CallRail

Read-only international **CallRail REST API v3** recipe. Create an API v3 key under Integrations > Data access > API keys and store it as `apiKey`. Requests send `Authorization: Token token="<key>"` and `Accept: application/json` to `https://api.callrail.com`.

## Operations

- `healthcheck`: `GET /v3/a.json` with empty input (cheap authenticated account list; pinned credential validator).
- `accounts.list`: `GET /v3/a.json` with optional `page`, `perPage`, `hipaaAccount`.
- `companies.list`: `GET /v3/a/{accountId}/companies.json`; `accountId` is required.
- `calls.list`: `GET /v3/a/{accountId}/calls.json` with optional `companyId`, `startDate`, `endDate`, `page`, `perPage`.
- `calls.get`: `GET /v3/a/{accountId}/calls/{callId}.json`.

Successful responses are raw provider JSON under AppCall `data`. Form-submission, tracker, and call-create writes are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.callrail.com`, quoted `Token token="..."` Authorization, and JSON `.json` paths. Native healthcheck omits the validator's `per_page=1` query. `fields` comma-join and `relative_pagination` are omitted. Native category is `crm` (source Marketing/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
