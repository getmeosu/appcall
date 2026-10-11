# AssemblyAI

International AssemblyAI recipe covering transcripts, LeMUR, streaming tokens, and LLM Gateway. Store an AssemblyAI API key as `apiKey`. Requests send `Authorization: <api-key>` (no Bearer prefix). The EU host `api.eu.assemblyai.com` is not used.

## Operations

- `healthcheck` / `transcripts.list` / `transcripts.get` / `transcripts.sentences` / `transcripts.paragraphs`
- `transcripts.create` / `transcripts.delete` / `transcripts.wordSearch` / `transcripts.redactedAudio`
- `realtime.createToken`: `GET https://streaming.assemblyai.com/v3/token`
- `lemur.task` / `lemur.summary` / `lemur.questionAnswer` / `lemur.actionItems` / `lemur.get` / `lemur.purge`
- `llm.chat`: `POST https://llm-gateway.assemblyai.com/v1/chat/completions`
- EventOnly webhooks: `webhook.transcript.completed`, `webhook.transcript.error`, `webhook.redacted_audio.ready`, `webhook.session.completed`

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs and are fixture-only; live smoke is unverified.
