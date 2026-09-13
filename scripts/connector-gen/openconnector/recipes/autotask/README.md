# Autotask

**HOLD.** Official Autotask PSA REST is served from a zone-specific host discovered at runtime. Pinned OpenConnector calls unauthenticated `GET https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation?user=` then stores `apiBaseUrl` (for example `https://webservices3.autotask.net/atservicesrest`) as credential metadata. Official entity REST hosts are `webservicesN.autotask.net`, `prde.autotask.net`, and `pres.autotask.net`. Native templates cannot admit computed hosts. ZoneInformation is unauthenticated and is not a cheap authenticated healthcheck. An Algolia/Grafana stored-id + bounded-wildcard pattern does not apply because the zone is computed from the username rather than a required stored product id. This recipe is not admitted.

Documented operations (not admitted) would send `Username`, `Secret`, and `APIIntegrationcode` headers:

- `healthcheck`: `GET /v1.0/Companies/entityInformation` (pinned validator)
- `records.get`: `GET /v1.0/{entity}/{id}`
- `entity.information`: `GET /v1.0/{entity}/entityInformation`

Query POST `/query`, impersonation, and `section=fields|userDefinedFields` path suffixes are omitted. Native category is `crm` (source Productivity/Data). `webservices.autotask.net` in fixtures is the official ZoneInformation lookup host, not a tenant REST host.

July 2021 Kaseya VSA REvil is a historical parent-company incident (patched; decryptor distributed). Autotask PSA REST was not the exploited surface.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.autotask.net/help/developerhelp/Content/APIs/REST/General_Topics/REST_Security_Auth.htm. Fixtures are independently derived and do not represent live provider access.
