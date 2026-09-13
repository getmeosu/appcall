# Faraday

Read-only Faraday REST API v1 recipe for the international customer-context product at `api.faraday.ai`. Create an API key in Faraday Settings (`https://app.faraday.ai/settings`). The runner sends `Authorization: Bearer <key>`.

Covered operations: credential-only `healthcheck` (`GET /accounts/current`), `accounts.current`, `accounts.list`, `datasets.list`, and `datasets.get`. Account/dataset writes, lookup/prediction POSTs, traits, scopes, and targets are omitted as writes or billable prediction.

List operations return Faraday's JSON arrays under `data`. Optional `ids[]` list filters are omitted because the native query template cannot repeat array parameters. Official curl examples send `Content-Type` on GET; native GET follows pinned source (`Accept` + Bearer) with no JSON body. Native category is `crm` because Rust CATEGORIES has no AI/data bucket.

This is Faraday, Inc. (Burlington, Vermont), not the Ruby Faraday HTTP client and not Faradaysec.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `accounts.current`.
