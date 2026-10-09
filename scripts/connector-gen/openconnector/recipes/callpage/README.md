# CallPage

International CallPage REST API recipe. Create an API token under Settings > API settings and store it as `apiKey`. Requests send `Authorization: <token>` (not Bearer) and `Accept: application/json` to `https://core.callpage.io`.

Covered HTTP operations include healthcheck, users, widgets, calls, managers, SMS, and voice templates, plus EventOnly webhooks for `call.new`, `call.scheduled`, `call.missed`, and `call.completed`.

Official docs: https://callpage.github.io/documentation-rest/. Upstream definitions are attributed to oomol-lab/open-connector (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
