# CentralStationCRM

Read-only CentralStationCRM JSON API recipe. Configure an API key from account settings plus the account subdomain from `https://{account}.centralstationcrm.net`. The runner sends the documented `X-apikey` header plus `Accept: application/json`. Hosts are bounded to `*.centralstationcrm.net` with a required stored account id (Algolia pattern).

Healthcheck is official `GET /api/user`. List operations (`people.list`, `companies.list`, `deals.list`) accept optional `page` and `perpage` (max 250). Official basics curl examples append `.json`; OpenAPI and this recipe use `/api/people` with `Accept: application/json`. No create/update/delete operation is exposed.

CentralStationCRM wraps actions in `defineAction`, so catalog admission uses a `reviewed-action-ids.json` row rather than static `defineProviderAction` extraction.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://centralstationcrm.com/api-basics. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
