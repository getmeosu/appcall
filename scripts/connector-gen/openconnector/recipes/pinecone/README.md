# Pinecone

Read-only international Pinecone Database control-plane recipe. Configure a project API key from the Pinecone console. The runner sends `Api-Key` and `X-Pinecone-Api-Version: 2026-04` to `https://api.pinecone.io`.

Covered operations: credential-only `healthcheck` (`GET /indexes`), `indexes.list`, and `indexes.get` (`GET /indexes/{name}`). Data-plane query/fetch/upsert/delete, index mutation, and caller-supplied `indexHost` are not exposed: per-index hosts such as `*.svc.*.pinecone.io` are not the Algolia-style required stored id plus bounded wildcard pattern.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.pinecone.io/reference/api/authentication and https://docs.pinecone.io/reference/api/2025-10/control-plane/list_indexes. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `indexes.list`.
