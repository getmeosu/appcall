# PDF.co

Read-only PDF.co Web API recipe for the international document API at api.pdf.co (Artifex Software, Inc. d/b/a ByteScout and PDF.co; United States). Copy an API key from https://app.pdf.co/ and store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://api.pdf.co`.

Selected operations are `healthcheck` and `account.balance.get` (`GET /v1/account/credit/balance`) and `pdf.info.get` (`POST /v1/pdf/info` with required `url` and optional `password`, `timeout`, and `expiration`). Healthcheck uses the remaining-credits probe, which official credit tables do not list as a charged conversion. `pdf.info.get` costs credits and is not used as healthcheck. HTML/URL conversion, merge, split, compress, text extraction, and transit-file fanout are omitted.

Adaptations versus the pinned OpenConnector source: native category is `utility`; `pdf.info.get` always sends `async: false` matching current docs and the pinned source; HTTP 200 bodies with `error: true` are demoted via `http.errors.bodyErrorPaths` `["error"]` (`status` is not used because a numeric 200 would count as an error); responses keep raw PDF.co JSON under `data` instead of the source credits/raw wrapper; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.pdf.co/api/account-balance-info and https://developer.pdf.co/api/pdf-info-reader. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`.
