# ArcGIS Online

Read-only ArcGIS Geocoding service recipe for the international World GeocodeServer at `geocode-api.arcgis.com`. Configure an ArcGIS API key / access token; the runner sends it as the official `token` query parameter with `f=json`.

Covered operations: credential-only `healthcheck` (`GET /suggest?text=Berlin&maxSuggestions=1`, official Suggests SKU is 0 credits), `geocode.suggest`, `geocode.find-address-candidates`, and `geocode.reverse`. Nested `{longitude,latitude}` location objects are omitted because native cannot serialize them to `lon,lat`; reverse geocode binds `location={{longitude}},{{latitude}}`. HTTP 200 bodies with an `error` object (token 498/499) fail via `bodyErrorPaths`. `findAddressCandidates` and `reverseGeocode` are billed SKUs and are not used as healthcheck.

Native category is `utility` (source Location/Data are not in native CATEGORIES). Operator: Esri, Redlands, California. The April 2026 developer-credential bulletin was patched 2026-04-13 and is recorded as historical remediated evidence, not an unresolved geocode-API compromise.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.arcgis.com/rest/geocode/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `geocode.suggest`.
