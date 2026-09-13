# Ambee

HOLD. Official international Ambee environmental data API at `https://api.ambeedata.com`. Configure an API key from the Ambee API dashboard. The runner sends `x-api-key`.

Pinned OpenConnector actions are billed geocode and air-quality lookups counted against daily quota. There is no cheap account/status/quota GET. The native credential validator is billable `GET /geocode/by-place?place=New York`. Billable lookup is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `geocode.place`, `geocode.reverse`, `air-quality.current`. Forecast and history are omitted.

Native category is `utility` (source Location/Data).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.ambeedata.com/apis/overview. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
