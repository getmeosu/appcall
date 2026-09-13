# Bouncer

Read-only Bouncer Email Verification API v1.1 recipe for Bouncer Sp. z o.o. (Wrocław, Poland). Configure an API key from the Bouncer dashboard. The runner sends `x-api-key` to `https://api.usebouncer.com`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` and `credits.get` (`GET /v1.1/credits`), `emails.verify` (`GET /v1.1/email/verify`), and `domains.verify` (`GET /v1.1/domain`). Batch, batch-sync, toxicity, and delete/finish writes are omitted. Email and domain verification consume credits except for documented sandbox addresses; do not use them as a healthcheck.

Adaptations versus the pinned OpenConnector source: native category is `utility` (source Communication / Marketing are not in Rust CATEGORIES); native hardcodes `timeout=30` on real-time verify to match the pinned source (docs default is 10 seconds); the upstream user-agent is not sent. Responses keep raw Bouncer JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.usebouncer.com/api-reference/credits/credits. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `credits.get`.
