# Viggle

Read-only Viggle `/api` recipe for WarpEngine Canada Inc. (Toronto). Configure an API key from the Viggle dashboard. The runner sends `Authorization: Bearer <key>` to `https://apis.viggle.ai` plus `Accept: application/json`.

Selected operations are credential-only `healthcheck` (`GET /api/credits`), `credits.get`, `characters.list`, `characters.get`, and `scenes.list`. Multipart character/scene/render writes and unauthenticated render-status polling are omitted. Healthcheck is an account credit-balance read, not a billable render.

A newer `/v1` edition exists; this recipe is the pinned `/api` host path. Native category is `utility` (source AI/Design & Media are not in native CATEGORIES).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.viggle.ai/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `characters.list`.
