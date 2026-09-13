# BuiltWith

Read-only international **BuiltWith API** recipe for BuiltWith Pty Ltd (Australia). Configure the API key from `https://api.builtwith.com`. Requests send `KEY` as a query parameter to `https://api.builtwith.com` and `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /whoamiv1/api.json`, 0 credits), `domain.summary` (Free API `/free1/api.json`), `domain.profile` (pinned Domain API `/v22/api.json` with `NOPII=yes` and `NOMETA=yes`), and `redirects.list` (`/redirect1/api.json`). Social lookup and recommendations are omitted. Domain profile lookups consume API credits; healthcheck and Free API do not.

HTTP 200 responses with a non-empty `Errors` array are treated as failures via `http.errors.bodyErrorPaths`. Native category is `dev-tools` plus `utility` (source Data is not in the Rust CATEGORIES allowlist). Current public Domain API docs advertise v24; native keeps pinned v22.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `domain.summary` with a root domain.
