# BambooHR

International BambooHR REST API recipe (v0.2.0). Configure a company subdomain and an API key. The runner sends HTTP Basic authentication with the API key as username and `x` as the password to `https://<companyDomain>.bamboohr.com`.

Covered operations: company/fields/employees (list/get/create/update/directory/changed), tables, users, lists, time-off types/policies/who's-out/requests, employee and company files, plus EventOnly `webhook.employee` and `webhook.time_off`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live smoke is unverified.
