# AccuLynx

Read-only AccuLynx API v2 recipe for the US AccuLynx construction CRM. Configure an API key from the AccuLynx API Keys page; the runner sends `Authorization: Bearer` to `https://api.acculynx.com/api/v2`. Official OpenAPI documents `bearerAuth` and prompts for a Bearer token. This is the international US product at `api.acculynx.com`, not a mainland-China edition.

Covered operations are credential-only `healthcheck` (`GET /company-settings`), `contactTypes.list`, `leadSources.list`, and `calendars.list`. Contact, job, and appointment writes are omitted. Pagination uses the official query names: `pageSize` plus `pageStartIndex` for contact types, and `pageSize` plus `recordStartIndex` for lead sources and calendars. Job-category/trade-type/work-type list actions are omitted because the pinned source maps `recordStartIndex` input onto `pageStartIndex` query names that disagree with several official parameter names.

Responses preserve raw AccuLynx JSON under `data`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key in setup, call `healthcheck` with `{}`, then `contactTypes.list`.
