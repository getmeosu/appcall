# HeyReach

International **HeyReach Public API** recipe (v0.2.0). Create an API key in HeyReach Settings and store it as `apiKey`. Requests send `X-API-KEY` to `https://api.heyreach.io/api/public`.

Covered HTTP operations: campaign list/get/pause/resume/start/leads, list list/get/create/leads, LinkedIn account list/get, inbox conversations, overall stats, webhook list/create/delete, and blacklist leads. EventOnly webhooks: `webhook.connection_request_accepted`, `webhook.message_reply_received`, `webhook.campaign_completed`, `webhook.message_sent`.

Official docs: https://docs.heyreach.io/hey-reach-api.md and the Public API Postman collection. Native category is `crm`.
