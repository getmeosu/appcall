# BambooHR

Read-only international BambooHR REST API recipe. Configure a company subdomain and an API key from the user menu → API Keys. The runner sends HTTP Basic authentication with the API key as username and `x` as the password to `https://<companyDomain>.bamboohr.com`. OAuth is not expressed.

The host is the required stored company subdomain plus the bounded `*.bamboohr.com` wildcard (Algolia/Grafana-style). Full URLs, dotted hosts, custom CNAMEs, and self-hosted instances are not admitted.

Covered operations: credential-only `healthcheck` (`GET /api/v1/company_information`), `fields.list`, `employees.list`, and `employees.get`. Writes, the fields comma-join query, and cursor `page[limit]`/`page[after]`/`page[before]` parameters are omitted. Provider `_links` next URLs are never followed.

Adaptations versus the pinned OpenConnector source: responses are raw BambooHR JSON under `data`; the upstream user-agent is not sent. Native category is `productivity` (source Productivity/Data).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://documentation.bamboohr.com/docs/getting-started and https://documentation.bamboohr.com/reference/get-company-information. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure subdomain + API key, call `healthcheck` with `{}`, then `employees.list`.
