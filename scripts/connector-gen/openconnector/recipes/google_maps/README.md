# Google Maps

HOLD. Official international Google Maps Platform Places API (New) recipe at `https://places.googleapis.com`. Configure a Maps Platform API key from Google Cloud Console. The runner sends `X-Goog-Api-Key`.

Pinned OpenConnector actions are all billed Maps Platform SKUs. There is no cheap account/status/quota GET. The native credential validator is billable `POST /v1/places:searchText`. Billable Geocoding is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted): `places.get`, `places.search`, `places.autocomplete`. Geocoding (query `key`, HTTP 200 status envelope) and Routes (extra host + required field mask) are omitted because native auth is a single header placement.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.google.com/maps/documentation/places/web-service/get-api-key. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
