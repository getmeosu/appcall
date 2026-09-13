# SiteSpeakAI

International SiteSpeakAI API v1 recipe. Generate an API token from the SiteSpeakAI account page and send it as `Authorization: Bearer <token>`.

Operations are bounded reads: `healthcheck` (`GET /v1/me`), `chatbots.list`, `chatbots.get`, `sources.list`, and `leads.list`. Chatbot IDs are URI-encoded. Official list endpoints return JSON arrays; native `data` is that array. Query chatbot is omitted because it is a billable model call. Updated-answer writes are omitted.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are supplied; live authentication is unverified.
