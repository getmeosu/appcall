# Better Stack

International Better Stack Uptime API recipe, plus Telemetry source-group routes. Configure a global or team API token from Better Stack → API tokens. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://uptime.betterstack.com`. Source-group create/update/delete use `https://telemetry.betterstack.com`.

Covered operations follow the official Uptime REST API (`/api/v2` and documented `/api/v3` incident, policy, metadata, and timeline routes) and the Composio `BETTER_STACK` toolkit (117 tools). `GET_UPTIME_API_TOKEN` is omitted because Better Stack does not expose an HTTP endpoint that returns the configured token.

Native category is `dev-tools`. EventOnly webhooks stay on incident start/ack/resolve and on-call change.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://betterstack.com/docs/uptime/api/getting-started-with-uptime-api/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
