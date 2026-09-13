# Census Bureau

Read-only US Census Data API recipe at `https://api.census.gov`. Configure a free Census Data API key from https://api.census.gov/data/key_signup.html. The runner sends the documented `key` query parameter plus `Accept: application/json`.

Healthcheck is the pinned credential probe `GET /data/2022/acs/acs5?get=NAME&for=us:*` — a tiny authenticated geography read on the free public API, not a commercial billed SKU. `datasets.list` is the discovery catalog `GET /data.json`. `groups.list` and `dataset.query` are pinned to ACS 2022 5-year because native path templates encodeURIComponent the whole `datasetPath` and cannot keep Census multi-segment paths as unencoded slashes. `dataset.query` takes official `get` and `for` strings (optional `in`). Client-side catalog filters and dynamic extra predicates are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.census.gov/data/developers/guidance/api-user-guide.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
