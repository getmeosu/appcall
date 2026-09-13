# Gamma

Read-only Gamma Public API v1.0 recipe for Gamma Tech, Inc. (San Francisco). Create an API key under Settings → API Keys (`sk-gamma-…`). The runner sends `X-API-KEY` to `https://public-api.gamma.app/v1.0`. Official first-party access uses this API key header, not Bearer OAuth.

Covered operations: credential-only `healthcheck` (`GET /themes`), `themes.list`, `folders.list`, and `generations.get`. Generation create/from-template and wait/poll helpers are omitted (writes and polling). Theme/folder lists admit optional `query`, `limit` (1–50), and `after`. Official `type=standard|custom` is omitted because the pinned source does not send it.

Official docs live at `https://developers.gamma.app`. Host is `public-api.gamma.app`. Native category is `productivity` (source AI/Design & Media are not in the native allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `themes.list`.
