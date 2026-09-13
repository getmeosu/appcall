# ClinicalTrials.gov

**HOLD.** Official international ClinicalTrials.gov JSON API v2 at `https://clinicaltrials.gov/api/v2` (U.S. National Library of Medicine / NIH). The API is unauthenticated (`no_auth`). There is no stored credential and no cheap authenticated healthcheck. Official `GET /version` is public.

Pinned `search_studies` injects a default fields list and pipe-joins filters. `get_studies_by_nct_ids` batches identifier lists (unsupported fanout). Native auth is `api_key` or `oauth2`; inventing a dummy secret would be untruthful. Selection is HOLD.

Covered operations (not admitted): `healthcheck` → `GET /version`; `studies.get` → `GET /studies/{nctId}`; `studies.search` → `GET /studies`; `search-areas.list` → `GET /studies/search-areas`. Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://clinicaltrials.gov/data-api/api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified. This recipe is not admitted.
