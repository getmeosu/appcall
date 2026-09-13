# Jiminny

Read-only international Jiminny Customer API v1 recipe pinned to the documented US production server `app.jiminny.com`. Configure an Admin/Owner API key from Settings > Organization Settings > Integrations. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://app.jiminny.com/customer/api/v1`.

Covered operations: credential-only `healthcheck` (`GET /me`), `organization.get`, `users.list` (`GET /getUsers`), `activities.get` (`GET /getActivity?activityId=`), and `topic-triggers.list` (`GET /getTriggers`). Activity list/search, transcription, generated summaries, scorecards, uploads, and webhooks are omitted.

EU (`app.jiminny.eu`) is not expressed: the source maps a stored region onto `.com` vs `.eu` hosts, which a bounded wildcard plus required stored id cannot represent. The native template pins the US host.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://jiminny.github.io/customer-api-docs/ and https://help.jiminny.com/en/articles/9527212-what-is-the-jiminny-api. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `users.list`.
