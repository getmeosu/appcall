# Anchor Browser

International **Anchor Browser API** recipe for `api.anchorbrowser.io`. Create an API key in the Anchor dashboard (API Access) and store it as `apiKey`. Requests send `anchor-api-key` and `Accept: application/json`.

Origin operations:

- `healthcheck`: `GET /v1/billing`
- `billing.get`: `GET /v1/billing`
- `projects.metadata.get`: `GET /v1/projects/{projectId}/metadata`

Deepened to the Composio ANCHOR_BROWSER toolkit (64 tools): sessions, OS-level input, profiles, legacy v1 tasks, recordings, events, extensions, integrations, agent files, batch session status, and AI tools. Multipart uploads (`extensions.upload`, `sessions.agent.files.upload`, `sessions.uploads.create`) are handwritten.

Successful JSON responses are raw provider JSON under AppCall `data`. Session and webpage screenshot endpoints may return `image/png` live; fixtures pin a JSON envelope.

## Adaptations

Pinned source and official docs agree on `https://api.anchorbrowser.io` and the `anchor-api-key` header. Extra Composio operations reuse source spans `api-base` and `request-auth`. Task tools use the documented **legacy v1** `/v1/task*` surface because Composio parameters (base64 code, draft/latest versions) match that API, not v2 generate/run. `GET_WEBPAGE_CONTENT` maps to `POST /v1/tools/fetch-webpage` (content fetch), not Web Unlocker `POST /v1/tools/fetch/webpage`. `UPDATE_PROFILE` uses `POST /v1/profiles` because official docs do not publish a PATCH/update verb. `GET_BATCH_SESSION_STATUS` is `GET /v1/batch-sessions/{batch_id}`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
