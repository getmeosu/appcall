# Fireberry

Read-only international **Fireberry REST API** recipe. This is the English CRM API at [api.fireberry.com](https://api.fireberry.com), not the `api.powerlink.co.il` host.

## Setup

Each Fireberry user has a personal API access token (TokenID) under Profile → Account Security → API Access Token. Store it as `apiKey`. Requests send `tokenid` and `Accept: application/json` to `https://api.fireberry.com`. Quick Start prose mentions an Authorization header; the documented example and this recipe send `tokenid`.

## Operations

- `healthcheck`: `GET /api/record/account?pagesize=1&pagenumber=1` with empty input (cheap authenticated list probe).
- `accounts.list`: `GET /api/record/account` with optional `pagesize` (1–50) and `pagenumber` (1–10).
- `accounts.get`: `GET /api/record/account/{id}`; `id` is a required GUID.
- `contacts.list`: `GET /api/record/contact` with the same optional page filters.
- `contacts.get`: `GET /api/record/contact/{id}`; `id` is a required GUID.

Successful responses are raw provider JSON under AppCall `data`. Writes, v3 query, and the Powerlink.co.il edition are omitted. Native `bodyErrorPaths` cannot invert Fireberry's `success` boolean, so these GET reads use HTTP status as the failure signal.

## Adaptations

Pinned source and official docs agree on `https://api.fireberry.com`, `tokenid`, and GET `/api/record/account`. Contacts use the same record REST pattern with object name `contact`. Native category is `crm` (source Productivity/Marketing are not in the Rust CATEGORIES allowlist).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
