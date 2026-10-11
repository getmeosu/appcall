# BambooHR

International BambooHR REST API recipe. Configure a company subdomain and an API key from the user menu → API Keys. The runner sends HTTP Basic authentication with the API key as username and `x` as the password to `https://<companyDomain>.bamboohr.com`. OAuth is not expressed.

The host is the required stored company subdomain plus the bounded `*.bamboohr.com` wildcard (Algolia/Grafana-style). Full URLs, dotted hosts, custom CNAMEs, and self-hosted instances are not admitted.

Covered operations map the 42 Composio BAMBOOHR tools plus origin extras `fields.list` and `employees.list` (44 request-backed actions). `healthcheck` is GET `/api/v1/company_information` (BAMBOOHR_COMPANY_GET_INFORMATION). Writes, ATS, files, reports, time off, dependents, and metadata list endpoints are included. Department/division/location/job-title/country tools share GET `/api/v1/meta/lists` (BambooHR returns every list field; client-side name filters are not applied in compiled requests). Composio triggers are 0; no inbound webhooks.

Handwritten handlers (registry) cover multipart `files.upload` / `ats.create_candidate`, binary `employees.photo`, optional `benefit.get_coverages` item path, and `reports.custom` GET-by-id. Compiled `request` blocks remain the fixture contract.

Adaptations versus the pinned OpenConnector source: responses are raw BambooHR JSON under `data`; the upstream user-agent is not sent. Native category is `productivity`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://documentation.bamboohr.com/docs/getting-started. Fixtures are independently derived and do not represent live provider access.
