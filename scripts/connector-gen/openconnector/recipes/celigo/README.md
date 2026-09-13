# Celigo

Read-only Celigo integrator.io Platform API recipe for the documented North America host `https://api.integrator.io`. Configure a Celigo API token from Resources → API tokens. The runner sends `Authorization: Bearer` plus `Accept: application/json`.

Healthcheck is `GET /v1/tokenInfo`. List operations return raw export, import, and flow JSON. `exports.get` requires `exportId`. Official EU residency host `api.eu.integrator.io` is omitted because native templates cannot switch hosts from an optional enum without a caller-supplied host. No create/update/delete or flow-run operation is exposed.

Celigo wraps actions in `defineAction`, so catalog admission uses a `reviewed-action-ids.json` row rather than static `defineProviderAction` extraction.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.celigo.com/hc/en-us/articles/360042281231-Getting-started-with-standard-REST-API. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
