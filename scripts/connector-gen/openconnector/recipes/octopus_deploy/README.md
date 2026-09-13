# Octopus Deploy

Read-only international Octopus Cloud REST API recipe. Configure an API key from Profile > My API Keys and the Cloud instance slug from `https://<instance>.octopus.app`. The runner sends `X-Octopus-ApiKey` to `https://<instance>.octopus.app/api`. Self-hosted Octopus Server and caller-supplied hosts are not admitted; the host is the stored instance slug plus the bounded `*.octopus.app` wildcard.

Covered operations: credential-only `healthcheck` (`GET /api/users/me`), `spaces.list`, `projects.list`, `projects.get`, and `environments.list`. Writes, deployments, tasks, and array `ids` filters are omitted.

Adaptations versus the pinned OpenConnector source: required stored `instance` replaces caller `baseUrl`; healthcheck uses validator `GET /api/users/me`; responses are raw Octopus JSON under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://octopus.com/docs/octopus-rest-api and https://octopus.com/docs/octopus-cloud/getting-started-with-cloud. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure instance + API key, call `healthcheck` with `{}`, then `spaces.list`.
