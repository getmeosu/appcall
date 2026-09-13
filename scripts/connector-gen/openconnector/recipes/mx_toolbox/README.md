# MxToolbox

Read-only MxToolbox REST API recipe for the international product. Configure an API key UUID from Settings → API. The runner sends `Authorization` with the raw UUID (no Bearer prefix).

Covered operations: credential-only `healthcheck` (`GET https://api.mxtoolbox.com/api/v1/Usage`), `usage.get`, `monitors.list`, `lookup.mx`, and `lookup.dmarc`. Lookups run on `mxtoolbox.com` and consume DNS quota; healthcheck is the usage counter, not a lookup. `lookup.mx` and `lookup.dmarc` require `domain`. Monitor path follows official `/api/v1/Monitor`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://mxtoolbox.com/restapi.aspx. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `usage.get`.
