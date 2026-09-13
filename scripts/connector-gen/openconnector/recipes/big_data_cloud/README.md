# BigDataCloud

**HOLD.** Official international BigDataCloud premium API recipe at `https://api-bdc.net`. Configure an API key from the BigDataCloud dashboard. The runner sends `key` as a query parameter and `Accept: application/json`. Official docs also document `x-bdc-key`; native follows the pinned query parameter.

Pinned OpenConnector actions are all billed monthly-volume lookups (Country by IP, Network by IP, Timezone by IP, reverse-geocode-with-timezone). There is no cheap account/status/quota GET. The native credential validator is billed `GET /data/country-by-ip?ip=8.8.8.8`. The free no-key client-side reverse geocoding endpoint is unauthenticated and browser-only, so it is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `country.by-ip`, `network.by-ip`, `timezone.by-ip`, `reverse-geocode`. Native category is `utility` (source Location/Security/Data). The native key is `big-data-cloud` while the upstream directory is `big_data_cloud`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.bigdatacloud.com/docs/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
