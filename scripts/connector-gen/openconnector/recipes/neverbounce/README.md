# NeverBounce

Read-only NeverBounce v4.2 REST recipe for ZoomInfo Technologies LLC (Vancouver, Washington, United States). Configure a Custom Integration API key. The runner sends it as the documented `key` query parameter to `https://api.neverbounce.com/v4.2` plus `Accept: application/json`.

Selected operations are `healthcheck` (`GET /account/info`), `jobs.status` (`GET /jobs/status?job_id=`), and `jobs.results` (`GET /jobs/results` with optional `page` and `items_per_page`). Healthcheck uses the authenticated account probe rather than billed `single/check`. Job create/parse/start, CSV download, and single verification are omitted. HTTP 200 bodies with a non-empty `message`/`error`/`error_message`/`reason` are treated as upstream errors; `status` is not used as a bodyErrorPath because the success value `success` is a non-empty string.

Adaptations versus the pinned OpenConnector source: current endpoint docs use `/v4.2` while older authentication samples still show `/v4`; native follows v4.2 plus pinned source; native category is `email-marketing` (source Communication/Marketing); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.neverbounce.com/docs/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `jobs.status` with a known `job_id`.
