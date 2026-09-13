# Klangio

HOLD. Official international **Klangio Transcription API** recipe at `https://api.klang.io`. Apply for API access at https://klang.io/api/ and store the key as `apiKey`. The runner sends `kl-api-key` and `Accept: application/json`.

Pinned OpenConnector job creation is `multipart/form-data`. Result downloads require connector transit storage. The native credential validator is `GET /job/00000000-0000-0000-0000-000000000000/status` and treats HTTP 404 as success, which is not a cheap account/list healthcheck and cannot be expressed as native `success: [200]`. `operationQuality` remains unproven, so selection is HOLD.

Covered operation (not admitted): `jobs.get` → `GET /job/{jobId}/status`. Multipart transcription/chord/beat/strum/separation creates and binary downloads are omitted.

Native category is `utility` (source AI / Design & Media are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://klang.io/api/ and https://docs-api.klang.io/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
