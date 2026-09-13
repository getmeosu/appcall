# Abyssale

Read-only Abyssale REST API recipe for the international Abyssale creative-automation service. Configure an API key from the Abyssale API page; the runner sends it as the official `x-api-key` header to `https://api.abyssale.com`. Covered operations are credential-only `healthcheck` (`GET /projects`), `projects.list`, `designs.list`, `designs.get`, and `fonts.list`. Banner generation, dynamic image URL creation, and project creation are omitted because they are writes or billable.

Responses preserve raw Abyssale JSON under `data`. List endpoints return JSON arrays. `designId` is URL-encoded. Official optional `project_id`/`type` design filters and font `type` filters are not exposed because the pinned source does not send them.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key in setup, call `healthcheck` with `{}`, then `designs.list`.
