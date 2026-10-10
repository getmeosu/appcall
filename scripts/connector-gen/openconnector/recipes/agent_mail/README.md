# AgentMail

AgentMail API v0 recipe for the international product at `api.agentmail.to`. Configure an API key from the AgentMail Console; the runner sends `Authorization: Bearer`. EU `api.agentmail.eu` and x402/mpp hosts are separate editions and are not exposed.

Covered HTTP operations: credential-only `healthcheck` (`GET /v0/auth/me`), inbox list/get/create/update/delete, message list/get/send/reply/delete, thread list/get, draft list/create/send, domain list/get, pod list, and webhook subscription list. EventOnly inbound webhooks cover `message.received`, `message.sent`, `message.delivered`, `message.bounced`, `message.complained`, `message.rejected`, `message.opened`, and `domain.verified`. Array message filters (`labels`, `from`, `to`, `subject`) remain omitted because the native query template cannot append arrays the way the pinned source does.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.agentmail.to/api-reference. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
