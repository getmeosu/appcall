# Pinecone

International Pinecone Database control-plane recipe (v0.2.0). Configure a project API key. The runner sends `Api-Key` and `X-Pinecone-Api-Version: 2026-04` to `https://api.pinecone.io`.

Covered operations: index/collection/backup/restore-job CRUD plus inference embed/rerank. Data-plane query/upsert on caller-supplied index hosts remains omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live smoke is unverified.
