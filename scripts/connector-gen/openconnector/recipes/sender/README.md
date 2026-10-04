# Sender

International Sender API v2 recipe at version 0.2.0. Create an API access token in Sender **Account settings → API access tokens** and send it as `Authorization: Bearer <token>`.

HTTP operations cover groups, subscribers, campaigns, fields, segments, and workflows, including list/get/create/update/delete on the primary resources. EventOnly webhooks map subscribers/new, subscribers/updated, subscribers/unsubscribed, groups/new, campaigns/new, and bounces/new. Successful HTTP responses are raw provider JSON under AppCall `data`. Fixtures omit Sender's success `message` string so `bodyErrorPaths: ["message"]` does not invert HTTP 200 writes.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures use `fixture-api-token` only; live authentication is unverified.
