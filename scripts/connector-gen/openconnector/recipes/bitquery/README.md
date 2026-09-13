# Bitquery

**HOLD.** Official international Bitquery V2 Streaming GraphQL recipe at `https://streaming.bitquery.io/graphql`. Configure an access token from Bitquery Authorization / API Access Tokens. The runner would send `Authorization: Bearer` plus `Accept` and `Content-Type: application/json`.

Pinned OpenConnector exposes only billed GraphQL `run_query`. The native credential validator POSTs an EVM Blocks query that consumes API points (about 5 points per call). Official `GET https://account.bitquery.io/api/usage` is a cheap account read on a different host and is not a pinned action, so it is not invented as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operation (not admitted): `query.run` (`POST /graphql` with required `query` and optional `variables` / `operationName`). HTTP 200 GraphQL envelopes with a non-empty `errors` array would be demoted via `bodyErrorPaths`. Native category is `dev-tools` (source Data is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.bitquery.io/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
