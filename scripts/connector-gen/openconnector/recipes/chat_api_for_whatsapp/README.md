# Chat API for WhatsApp

**HOLD.** Unofficial WhatsApp Web REST API at `https://api.chat-api.com`. Configure a Chat API token and numeric instance ID from the Chat API dashboard. The runner sends `token` as a query parameter and interpolates `/instance{{instanceId}}/` on the fixed host `api.chat-api.com`.

chat-api.com does not publish a legal entity or registered office. English and Russian marketing copy describe an Eastern European provider since 2015. Distinct from GREEN-API LLC and from Meta WhatsApp Cloud API. Unknown geography/edition/operator is HOLD, never APPROVED. The English docs page itself states the documented unofficial API article has lost relevance and points at a Business API successor.

Covered operations (not admitted): `healthcheck` (`GET /status`), `settings.get`, `chats.list` (`GET /dialogs`), `messages.list`, `queue.list`. Send, file, webhook, and queue-clear writes are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://chat-api.com/en/docs.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
