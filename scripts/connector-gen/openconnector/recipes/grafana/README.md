# Grafana

Read-only international Grafana Cloud HTTP API recipe. Configure a Grafana Cloud stack slug and a service account token from Administration > Users and access > Service Accounts. The runner sends `Authorization: Bearer` to `https://<stack>.grafana.net`. Self-hosted Grafana and caller-supplied hosts are not admitted; the host is the stored stack slug plus the bounded `*.grafana.net` wildcard.

Covered operations: credential-only `healthcheck` (`GET /api/org`), `datasources.list`, `datasources.get`, `alert-rules.list`, `alert-rules.get`, and `contact-points.list`. Folder/dashboard App Platform paths, writes, search multi-value query, and private-network self-hosted URLs are omitted.

Adaptations versus the pinned OpenConnector source: required stored `stack` replaces caller `baseUrl`; healthcheck uses validator `GET /api/org` mapped to `list_data_sources`; responses are raw Grafana JSON under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/authentication/ and https://grafana.com/docs/grafana/latest/developers/http_api/data_source/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure stack + token, call `healthcheck` with `{}`, then `datasources.list`.
