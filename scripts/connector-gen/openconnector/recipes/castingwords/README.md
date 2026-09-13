# CastingWords

Read-only international CastingWords Store API v4 recipe for CastingWords LLC (Los Alamos, New Mexico, United States). Copy the API key from `https://castingwords.com/customer/info`. The runner sends `api_key` as a query parameter on GET requests to `https://castingwords.com/store/API4`.

Covered operations: credential-only `healthcheck` (`GET /prepay_balance`) and `transcription.status` (`GET /audiofile/{audiofileId}`). Transcript download is omitted because it returns text/html, not JSON. Order POST is omitted as a billed write that places `api_key` in the JSON body. Native category is `productivity` (source Design & Media/Productivity).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `transcription.status`.
