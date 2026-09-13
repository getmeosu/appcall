# Certifier

Read-only international Certifier REST API recipe. Create an access token in Settings → Developers → Access Tokens. The runner sends `Authorization: Bearer` and the required `Certifier-Version: 2022-10-26` header to `https://api.certifier.io/v1`.

## Operations

- `healthcheck`: `GET /groups?limit=1` with empty input (pinned credential validator).
- `groups.list`: `GET /groups` with optional `limit` (1–100) and `cursor`.
- `designs.list`: `GET /designs` with optional `limit` and `cursor`.
- `credentials.list`: `GET /credentials` with optional `limit` and `cursor`.
- `interactions.list`: `GET /credential-interactions` with optional `credentialId`, `limit`, and `cursor`.

Writes, `POST /credentials/search`, and create-issue-send are omitted. Native returns raw Certifier JSON under `data`. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Groups are still addressed at `/groups` while Certifier docs rename them credential templates.

## Adaptations

Pinned source and official docs agree on Bearer auth, `Certifier-Version: 2022-10-26`, and `https://api.certifier.io/v1`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.certifier.io/docs/api-reference/quickstart and https://developers.certifier.io/docs/api-reference/pagination. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
