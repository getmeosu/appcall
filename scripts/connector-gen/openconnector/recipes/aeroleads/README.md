# AeroLeads

**HOLD.** AeroLeads LinkedIn details API is a billed enrichment lookup. Official docs and blog copy state each API call consumes about 1 credit. The pinned OpenConnector connector exposes only `get_details_from_linkedin_url` (`GET https://aeroleads.com/api/get_linkedin_details` with `api_key` and `linkedin_url` query parameters) and validates credentials format-only. There is no cheap authenticated account read for healthcheck.

HTTP 200 bodies may carry `successful`/`status` failure flags. Native `bodyErrorPaths` treat a truthy boolean as error and cannot invert those flags. Official `/api_docs/get_linkedin_details` curl uses `/apis/get_linkedin_details`; the current `/api` page and pinned source use `/api/get_linkedin_details`.

Native category is `crm` (source Marketing/Data are not both in native CATEGORIES). Name/company email finder `GET /apis/details` is omitted; it is not in the pinned action list.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://aeroleads.com/api and https://aeroleads.com/api_docs/get_linkedin_details. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified. This recipe is not admitted.
