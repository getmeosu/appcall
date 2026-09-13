# Gem

Read-only international **Gem CRM API v0** recipe. This is the recruiting CRM at [gem.com](https://www.gem.com), not Greenhouse and not the unrelated Gem.co crypto API. Gem also publishes ATS and Job Board APIs; those editions are out of scope.

## Setup

Team admins provision a 40-character team API key from Gem Team Settings. Store it as `apiKey`. Requests send `X-API-Key` and `Accept: application/json` to `https://api.gem.com`.

## Operations

- `healthcheck`: `GET /v0/users?page_size=1` with empty input (cheap authenticated list probe).
- `users.list`: `GET /v0/users` with optional `email`, 1-indexed `page`, and `page_size` (1–100).
- `candidates.list`: `GET /v0/candidates` with the same optional filters.
- `candidates.get`: `GET /v0/candidates/{candidate_id}`; the ID is percent-encoded as one path segment.
- `projects.list`: `GET /v0/projects` with optional page filters.

Successful responses are raw provider JSON under AppCall `data`. Gem list endpoints return JSON arrays. The `X-Pagination` header is not mapped. Writes, sequence/custom-field operations, and `candidate_ids` comma-join are omitted.

## Adaptations

Pinned source and official docs agree on host, `X-API-Key`, and `/v0` paths. Healthcheck uses the pinned credential-validator probe rather than a billable search.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
