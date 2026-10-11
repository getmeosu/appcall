# Drata

International Drata Public API v2 recipe pinned to the documented default US host `public-api.drata.com`. Configure a Drata Settings API key. The runner sends `Authorization: Bearer` to `https://public-api.drata.com/public/v2`.

Covered HTTP operations: credential-only `healthcheck` (`GET /company`), workspaces, personnel, vendors (list/get/create/update/delete), assets, policies, devices, workspace-scoped controls, personnel devices, users, events, and risks. Event-only webhooks cover custom-workflow personnel non-compliance, control not ready, evidence past due, and residual-risk changes. Evidence uploads, policy multipart creates, and OpenSearch `personnel-search` are omitted.

EU (`public-api.eu.drata.com`) and APAC (`public-api.apac.drata.com`) hosts are not expressed: the source maps a stored region enum onto three hostnames, and the US value is not `public-api.us.drata.com`, so a bounded wildcard plus required stored id cannot represent the mapping. `expand[]` and other repeated query arrays are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `workspaces.list`.
