# Axiom

Read-only international Axiom Cloud REST API recipe. Configure an API token from Settings > API tokens in Axiom. The runner sends `Authorization: Bearer` to `https://api.axiom.co`. Personal-access-token `x-axiom-org-id` is not expressed.

Covered operations: credential-only `healthcheck` (`GET /v2/datasets`), `datasets.list`, and `datasets.get`. APL query, dataset create, and dataset delete are omitted as writes or billable. Ingest/query edge hosts are not admitted; management REST is pinned to `api.axiom.co`.

Adaptations versus the pinned OpenConnector source: responses are raw Axiom JSON under `data` (list endpoints are JSON arrays); `datasetId` replaces source `dataset_id`; the upstream user-agent is not sent. Native category is `dev-tools` (source Data/Developer Tools).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://axiom.co/docs/reference/tokens and https://axiom.co/docs/restapi/endpoints/getDatasets. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API token, call `healthcheck` with `{}`, then `datasets.list`.
