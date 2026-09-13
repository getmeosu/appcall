# Apiframe

Read-only international Apiframe v2 recipe. Configure an API key from https://console.apiframe.ai (keys start with `afk_`). The runner sends `X-API-Key` and `Accept: application/json` to `https://api.apiframe.ai`.

Healthcheck is `GET /v2/models`, a cheap authenticated catalog list. Official `GET /v2/me` is the pinned credential probe but is not a pinned upstream action, so it is not fabricated. Image, video, and music generation POSTs consume credits and are omitted.

Operations: `healthcheck`, `models.list`, `jobs.get`, and `jobs.list`. `jobs.get` URL-encodes `id` as a path segment. Optional list filters match the pinned source query names (`includeModels` wire name `include_models`).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs and the pinned source and do not represent live provider access. Live authentication is unverified.
