# AbuseIPDB

**HOLD.** Official international AbuseIPDB APIv2 recipe at `https://api.abuseipdb.com/api/v2`. Configure an API key from the AbuseIPDB account API page. The runner sends the `Key` header plus `Accept: application/json`.

Pinned OpenConnector actions are all quota-consuming lookups. There is no cheap account/status/quota GET. The native credential validator is billed `GET /api/v2/check?ipAddress=8.8.8.8&maxAgeInDays=30`. Billable CHECK is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `ip.check`, `reports.list`, `block.check`, `blacklist.get`. Report/clear writes and plaintext blacklist are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.abuseipdb.com/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
