# Altiria

HOLD. Official Altiria REST API recipe. Configure the API username (non-secret) and API password from APIs > Change API password. The runner would send HTTP Basic to `{DASHBOARD_HOST}/api/rest`. Official docs parameterize `{{DASHBOARD_HOST}}`; the pinned source requires a caller-supplied HTTPS dashboard host. `www.altiria.net` is the definition placeholder only. There is no Algolia-style stored-id + bounded wildcard, so `boundedNetwork` remains unproven.

Covered operations (not admitted): `healthcheck` (`GET /groups?limit=1`), `groups.list`, `contacts.list`, `contacts.get`, `sms.get`. SMS send and contact writes are omitted.

Native category is `messaging` (source Communication/Marketing).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apidocs.altiria.com/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
