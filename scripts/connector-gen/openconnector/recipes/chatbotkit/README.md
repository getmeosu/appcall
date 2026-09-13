# ChatBotKit

**HOLD.** Official international ChatBotKit REST API v1. Configure an API secret from https://chatbotkit.com/tokens. The runner sends `Authorization: Bearer`. Official OpenAPI base URL is `https://api.chatbotkit.com/v1` (pinned source prefixes `/api/v1`; native follows the OpenAPI server).

Pinned `actions.ts` registers operations via `function action(name) { return defineProviderAction(service, { name, ... }) }`. Isolated `extractActions` returns no IDs, so `verifyRecipeSources` throws `upstream action does not exist` before selection HOLD can apply. `reviewed-action-ids.json` is outside this lane's allowlist and was not edited. `operationQuality` remains unproven.

Covered operations (not admitted until action IDs are allowlisted): `healthcheck` (`GET /usage/fetch`, current-period usage counters, not a billed completion), `bots.list`, `bots.get`, `conversations.list`, `datasets.list`. Completions, dataset search, file upload, and writes are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.chatbotkit.com/v1/spec.json. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
