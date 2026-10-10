# CodeRabbit

CodeRabbit REST API recipe at `api.coderabbit.ai`. Configure an API key from the CodeRabbit dashboard; the runner sends `x-coderabbitai-api-key`.

Covered HTTP operations: credential-only `healthcheck` (`GET /v1/users`), users list/seat/role management, roles list/get/create/update/delete/permissions, audit logs, organizations, repositories, learnings list/update/delete, review metrics, review-comment metrics, and AI Deep Scan findings. CodeRabbit does not expose customer EventOnly inbound webhooks on this API.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.coderabbit.ai/api. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified. The January 2025 Kudelski sandbox/RCE disclosure is a historical remediated incident recorded on the recipe.
