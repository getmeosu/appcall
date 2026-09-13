# Apple Maps

**HOLD.** Official international Apple Maps Server API at `https://maps-api.apple.com`. Create a Maps ID and .p8 key in the Apple Developer account, then sign an ES256 Maps auth token (`iss` = Team ID, `kid` = Key ID, `scope` = `server_api`).

Pinned OpenConnector exchanges that JWT at `GET /v1/token` and sends the returned access token as `Authorization: Bearer` to geocode, place, search, directions, and ETA endpoints. Token exchange and business calls share a 25,000 daily quota with MapKit JS. Native cannot sign the JWT. There is no cheap account/status GET (`credentials` / healthcheck / `operationQuality` unproven). Selection is HOLD.

Covered operations (not admitted): `places.get` → `GET /v1/place/{placeId}`; `geocode` → `GET /v1/geocode?q=`. Search, directions, ETAs, and autocomplete omitted. Native category is `utility` (source Location / Developer Tools; Location is not in the Rust CATEGORIES allowlist). The stand-in Bearer `privateKey` header is not the Apple Maps wire. Geocode is not used as healthcheck.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.apple.com/documentation/applemapsserverapi/creating-and-using-tokens-with-maps-server-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
