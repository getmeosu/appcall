# Manus

Manus Open API v2 recipe. Configure an API key from Manus Developers settings. The runner sends `x-manus-api-key` to `api.manus.ai`.

Covered HTTP operations (v0.2.0): `healthcheck`, task list/get/create/update/stop/delete/sendMessage/listMessages, project list/create, connector list, agent list/get/update, file upload/get, skill list, webhook list/create, usage.credits.get, and user.me. EventOnly webhooks: `webhook.task_created`, `webhook.task_stopped`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://open.manus.ai/docs/v2/introduction.
