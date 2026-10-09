# Freshteam

International **Freshteam** HR/ATS recipe at [freshworks.com/freshteam](https://www.freshworks.com/freshteam/). It is not Freshdesk.

## Setup

Copy the API key from Freshteam API Settings and store it as `apiKey`. Store the account subdomain only (the `acme` in `acme.freshteam.com`) as required `domain`. Requests send `Authorization: Bearer <apiKey>` to `https://<domain>.freshteam.com`. Hosts are bounded to `*.freshteam.com`.

## Operations

HTTP actions cover employees, job postings/applicants, org directory (branches, departments, teams, roles, levels), time-off, new hires, and candidate sources. EventOnly webhooks map Freshteam product events `onEmployeeCreate` and `onEmployeeUpdate`.

Successful list responses are raw JSON arrays under AppCall `data`. Pagination `Link` headers are not followed.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
