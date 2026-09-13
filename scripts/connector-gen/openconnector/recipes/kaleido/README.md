# Kaleido

Read-only international Kaleido Platform API v1 recipe pinned to the documented default US host `console.kaleido.io`. Configure an organization API key from the Kaleido console API Keys area. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://console.kaleido.io/api/v1`.

Covered operations: credential-only `healthcheck` (`GET /memberships`), `memberships.list`, `consortia.list`, `consortia.get`, and `environments.list`. Node/service writes, runtime JSON-RPC, and application credentials are omitted.

Caller-supplied `baseUrl` and official regional hosts (`console-eu.kaleido.io`, `console-ap.kaleido.io`, `console-ko.kaleido.io`, `console-us1.kaleido.io`) are not expressed: the source accepts an optional URL from a bounded host set, which is not the Algolia-style required stored id plus bounded wildcard pattern.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.kaleido.io/platform.html and https://docs.kaleido.io/developers/automation/api-101/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `consortia.list`.
