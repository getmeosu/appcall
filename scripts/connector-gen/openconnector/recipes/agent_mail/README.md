# AgentMail

Read-only AgentMail API v0 recipe for the international product at `api.agentmail.to`. Configure an API key from the AgentMail Console; the runner sends `Authorization: Bearer`. EU `api.agentmail.eu` and x402/mpp hosts are separate editions and are not exposed.

Covered operations: credential-only `healthcheck` (`GET /v0/auth/me`), `inboxes.list`, `inboxes.get`, `messages.list`, and `messages.get`. Send, reply, draft, webhook, domain, and pod mutation operations are omitted. Array message filters (`labels`, `from`, `to`, `subject`) are omitted because official docs repeat those query names as lists and the native query template cannot append arrays the way the pinned source does.

The pinned credential validator uses `GET /v0/inboxes?limit=1`; native healthcheck prefers official Who Am I as a cheaper authenticated identity read.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.agentmail.to/api-reference. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `inboxes.list`.
