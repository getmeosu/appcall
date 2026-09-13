# OpenStatus

Read-only international OpenStatus managed API recipe. Create an API key from Settings > General > API Keys. The runner sends `x-openstatus-key` to `https://api.openstatus.dev`. Self-hosted OpenStatus URLs are not admitted.

Covered operations: credential-only `healthcheck` (`GET /v1/whoami`), `monitors.list`, `monitors.get`, and `monitors.status.get` (ConnectRPC MonitorService). Writes, trigger, and paid HTTP response logs are omitted.

Adaptations versus the pinned OpenConnector source: healthcheck uses official `GET /v1/whoami` mapped to `list_monitors`; list/get/status use POST `/rpc/openstatus.monitor.v1.MonitorService/{Method}` matching the Node SDK `client.monitor.v1.MonitorService` and pinned source; responses are raw JSON under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.openstatus.dev/docs/sdk/nodejs/authentication and https://www.openstatus.dev/docs/sdk/nodejs/monitor-service. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
