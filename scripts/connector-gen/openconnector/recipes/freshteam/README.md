# Freshteam

Read-only international **Freshteam** recipe. Freshteam is the Freshworks HR/ATS product at [freshworks.com/freshteam](https://www.freshworks.com/freshteam/). It is not Freshdesk.

## Setup

Copy the API key from Freshteam API Settings and store it as `apiKey`. Store the account subdomain only (the `acme` in `acme.freshteam.com`) as required `domain`. Requests send `Authorization: Bearer <apiKey>` to `https://<domain>.freshteam.com`. Hosts are bounded to `*.freshteam.com`.

Official docs describe obtaining that key from API Settings even while mentioning OAuth 2.0. Mapping the key as `api_key` Bearer is the documented first-party path.

## Operations

- `healthcheck`: `GET /api/employees?page=1` with empty input (pinned credential probe).
- `employees.list`: `GET /api/employees` with optional `page` (minimum 1) and `status` (`active` or `inactive`).
- `employees.get`: `GET /api/employees/{employeeId}`.
- `jobPostings.list`: `GET /api/job_postings` with optional `page` and `status`.
- `jobPostings.get`: `GET /api/job_postings/{jobPostingId}`.

Successful list responses are raw JSON arrays under AppCall `data`. Pagination `Link` headers are not followed. Writes, `include` comma-join, and extra directory filters are omitted.

## Adaptations

Official overview lists `GET /employees`; curl samples and pinned source use `/api/employees` and `/api/job_postings`. This recipe keeps the `/api` prefix.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
