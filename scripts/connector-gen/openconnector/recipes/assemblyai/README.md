# AssemblyAI

Read-only international **AssemblyAI Transcript API** recipe. Create an API key in the AssemblyAI dashboard and store it as `apiKey`. Requests send `Authorization: <api-key>` (no `Bearer` prefix) and `Accept: application/json` to `https://api.assemblyai.com`. The EU host `api.eu.assemblyai.com` is not used.

## Operations

- `healthcheck`: `GET /v2/transcript?limit=1` (cheap authenticated list; same path as the pinned credential validator).
- `transcripts.list`: `GET /v2/transcript` with optional `limit`, `status`, `createdOn` (`created_on`), `beforeId` (`before_id`), `afterId` (`after_id`).
- `transcripts.get`: `GET /v2/transcript/{transcriptId}`.
- `transcripts.sentences`: `GET /v2/transcript/{transcriptId}/sentences`.
- `transcripts.paragraphs`: `GET /v2/transcript/{transcriptId}/paragraphs`.

Successful responses are raw provider JSON under AppCall `data`. Create/delete transcript operations are omitted because they are writes; listing transcripts is not a billed transcription job.

## Adaptations

Pinned source and official docs agree on raw `Authorization` API-key auth and `api.assemblyai.com/v2`. Native category is `dev-tools` (source AI/Developer Tools; AI is not in the Rust CATEGORIES allowlist). Deprecated `throttled_only` is omitted. Pinned user-agent is omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
