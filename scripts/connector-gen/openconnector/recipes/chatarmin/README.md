# Chatarmin

Chatarmin public API recipe for chatarmin.com GmbH (Vienna), version 0.2.0. Configure an API key from Chatarmin dashboard profile settings. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.chatarmin.com/api/public`.

HTTP operations cover contacts, campaigns, flows, WhatsApp send, voucher pools, and webhook subscriptions, plus credential-only `healthcheck`. EventOnly webhooks map vendor topics `contact/created`, `contact/updated`, `contact/deleted`, `flow/enrolled`, and `message/updated`. Pagination is caller-controlled.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apidocs.chatarmin.com/reference/api-overview. Fixtures are independently derived and do not represent live provider access.
