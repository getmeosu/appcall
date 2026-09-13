# Tomba

Read-only international **Tomba Email Intelligence API** recipe. Tomba is the email finder and enrichment product at [tomba.io](https://tomba.io/). Generate an API key and secret at [app.tomba.io/api](https://app.tomba.io/api) and store them as `apiKey` and `apiSecret`. Requests send `X-Tomba-Key`, `X-Tomba-Secret`, and `Accept: application/json` to `https://api.tomba.io/v1`.

## Operations

- `healthcheck`: `GET /me` with empty input (cheap authenticated account probe; not a billed search).
- `emails.count`: `GET /email-count` with required `domain` (official zero-credit preview).
- `domain.search`: `GET /domain-search` with required `domain` and optional `page` (≥ 1). This consumes search credits.
- `email.finder`: `GET /email-finder` with required `domain`, `firstName`, and `lastName` (wired as `first_name` / `last_name`). This consumes finder credits.

Successful responses are raw Tomba JSON under AppCall `data`. Verifier, enrich, LinkedIn, technology, and Reveal POST search are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.tomba.io/v1` and dual `X-Tomba-Key` / `X-Tomba-Secret` headers. Dual-header auth uses `http.auth` for the key and `http.headers` for `X-Tomba-Secret={{apiSecret}}`. Native requires `domain` on domain search (official also accepts `company`). Official `limit` enum `10|20|50` is omitted because the pinned source used unbounded `positiveInteger`. Native category is `crm` (source Marketing/Data are not in the Rust CATEGORIES allowlist). Native returns raw JSON under `data` instead of the pinned camelCase account wrapper. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
