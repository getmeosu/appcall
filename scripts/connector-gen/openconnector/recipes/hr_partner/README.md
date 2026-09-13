# HR Partner

Read-only international **HR Partner** recipe for HR Partner Software Pty Ltd (Darwin, Australia). Product is the cloud HR platform at [hrpartner.io](https://www.hrpartner.io/), used in 70+ countries. This is not PageUp or another Australian HR vendor.

## Setup

Enable API access under Setup > Configure > Integrations, copy the API token, and store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://api.hrpartner.io`.

## Operations

- `healthcheck`: `GET /company` with empty input (cheap authenticated company probe).
- `company.get`: `GET /company` with optional `custom_fields` and `active_modules` booleans.
- `employees.list`: `GET /employees` with optional `search`.
- `employees.get`: `GET /employee/{employee_code}`; the code is percent-encoded as one path segment.
- `jobs.list`: `GET /jobs` with optional `search`.

Successful list responses are raw JSON arrays under AppCall `data`. Official docs do not paginate. Writes, applicant/application endpoints, and extra directory filters are omitted.

## Adaptations

Pinned source and official docs agree on host, `x-api-key`, `/company`, `/employees`, and `/employee/{code}`. Job listings use official `GET /jobs`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
