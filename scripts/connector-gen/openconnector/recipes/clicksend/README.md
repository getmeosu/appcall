# ClickSend

ClickSend REST API v3 recipe. Configure the dashboard API username (non-secret) and API key (secret). The runner sends HTTP Basic authentication with username as the Basic username and the API key as the Basic password to `https://rest.clicksend.com/v3`, plus `Accept: application/json`.

Selected operations cover account healthcheck, contact lists and contacts (read and write), SMS send/price/history/receipts/inbound/templates, dedicated numbers, and SMS statistics. `list_id` and `contact_id` are required positive integers and are URL-encoded as path segments. SMS send and price take a `messages` array whose items require `body` and `to`.

ClickSend delivers SMS delivery receipts and inbound SMS to a registered HTTPS URL. Those inbound events are declared as EventOnly webhook operations (`webhook.sms_receipt`, `webhook.sms_inbound`) in the apollo `webhook.phone_revealed` shape. There is no Bun webhook handler or registry entry.

Adaptations versus the pinned OpenConnector source: native Basic auth uses `http.auth.basic`; GET requests omit `Content-Type`; JSON writes set `Content-Type: application/json`; responses keep raw provider JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.clicksend.com/docs and https://developers.clicksend.com/docs/rest/v3/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure both setup fields, call `healthcheck` with `{}`, then `lists.list`.
