# Botsonic

Botsonic Business REST API recipe for Writesonic, Inc. Configure a bot API token from the Botsonic dashboard Integration Page → REST API. The runner sends `X-BOT-KEY` to `https://api.botsonic.ai`, plus `Accept: application/json`. Version 0.2.0 covers FAQ, conversation, training-data, starter-question, and generate actions plus an EventOnly `webhook.form_entry`. Account-level `USER-API-KEY` bot CRUD and multipart file upload are omitted. Generation does not set `stream`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.botsonic.com/docs/rest-api. Fixtures use `fixture-api-token` only. Live smoke is unverified.
