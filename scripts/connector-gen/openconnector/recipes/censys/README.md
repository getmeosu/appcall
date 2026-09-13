# Censys

**HOLD.** Official international Censys Platform API v3 recipe at `https://api.platform.censys.io/v3`. Configure a Personal Access Token from https://platform.censys.io. The runner sends `Authorization: Bearer` plus `Accept: application/json`.

Pinned OpenConnector actions are all credit-consuming entity lookups (host, certificate, web property). There is no cheap account/status/credits GET in pinned actions. The native credential validator is billed `GET /v3/global/asset/host/8.8.8.8`. Billable lookup is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `host.get`, `certificate.get`, `web-property.get`. Search, bulk, collections, and threat-hunting endpoints are omitted.

Censys wraps actions in `defineAction`, so catalog admission uses a `reviewed-action-ids.json` row rather than static `defineProviderAction` extraction.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.censys.com/docs/platform-api-transition-guide. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
