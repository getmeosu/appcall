# bioRxiv and medRxiv

**HOLD.** Official international bioRxiv/medRxiv public REST API at `https://api.biorxiv.org` (Cold Spring Harbor Laboratory, New York). The API is unauthenticated (`no_auth`). There is no stored credential and no cheap authenticated healthcheck.

Pinned source treats HTTP 200 bodies whose `messages.status` is not `ok` / `no posts found` / `no articles found` as errors. Native `bodyErrorPaths` treat any non-empty string as an error, so they cannot whitelist those success strings. This is HTTP 200 false-success without a usable native error path.

Covered operations (not admitted): `healthcheck` (`GET /sum/m/json`), `preprints.list`, `preprints.get` (DOI split into prefix/suffix path segments so the slash stays a separator), `published.list`. Publisher-prefix and usage-statistics endpoints are omitted.

Native category is `utility` (source Data is not in native CATEGORIES). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.biorxiv.org/details/help. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified. This recipe is not admitted.
