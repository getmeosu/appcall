# Respond.io

International Respond.io Developer API v2 recipe at version 0.2.0. Create a token in Workspace Settings > Integrations > Developer API (Growth plan or above) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.respond.io/v2`.

HTTP operations cover workspace users and channels, contacts (list/get/create/update/delete/merge/channels/tags), messages, conversations, comments, and tags. EventOnly webhooks map New Contact, Contact Updated, New Incoming/Outgoing Message, and Conversation Opened/Closed. Successful HTTP responses are raw provider JSON under AppCall `data`.

Pinned source: [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures use `fixture-api-token` only; live smoke is unverified.
