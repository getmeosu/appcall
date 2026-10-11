# Pinecone

International Pinecone Database recipe covering the control plane at `https://api.pinecone.io` plus data-plane and assistant hosts bounded to `*.pinecone.io`.

Configure a project API key from the Pinecone console. The runner sends `Api-Key` and `X-Pinecone-Api-Version: 2026-04`. Control-plane operations stay declarative. Data-plane and assistant-data operations take a caller-supplied `index_host` / `assistant_host`, validate https and a `*.pinecone.io` hostname, then call the official path. That is not an Algolia stored-id template; the wildcard allowlist plus handwritten host checks keep the request on Pinecone.

Covered operations: origin `healthcheck`, `indexes.list`, `indexes.get`, plus the remaining Composio PINECONE HTTP tools (create/configure/delete index, backups, restore jobs, collections, models, inference, assistants, files, namespaces, vectors, and bulk imports). `indexes.get` keeps the origin `name` path parameter; Composio `PINECONE_DESCRIBE_INDEX` maps to `indexes.describe` (`index_name`).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.pinecone.io/reference/api/authentication. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
