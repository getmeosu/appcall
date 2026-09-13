# BrowserStack

Read-only international BrowserStack Automate REST API recipe. Configure the dashboard username (non-secret) and access key (secret) from https://www.browserstack.com/accounts/settings. The runner sends HTTP Basic authentication to `https://api.browserstack.com` plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /automate/builds.json?limit=1`), `builds.list`, `sessions.list`, and `sessions.get`. Offset pagination is caller-controlled. Session status updates, deletes, log downloads, and Automate Self-hosted / TurboScale hosts are omitted.

Adaptations versus the pinned OpenConnector source: native Basic auth uses `http.auth.basic` rather than a handwritten header; source input `project_id` / `build_id` / `session_id` are native `projectId` / `buildId` / `sessionId` to match official query and path names; GET requests omit `Content-Type` because the source only sets it when a JSON body is present; the upstream user-agent is not sent; responses keep raw provider JSON under `data` instead of the source `builds` / `sessions` / `session` wrappers.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.browserstack.com/automate/rest-api, https://www.browserstack.com/docs/automate/api-reference/selenium/build, https://www.browserstack.com/docs/automate/api-reference/selenium/session. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure both setup fields, call `healthcheck` with `{}`, then `builds.list`.
