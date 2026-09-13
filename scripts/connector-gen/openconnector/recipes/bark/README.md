# Bark

**HOLD.** Official Bark REST is served from the public host `api.day.app` **or** a caller-owned self-hosted bark-server. Pinned OpenConnector accepts an optional HTTPS `baseUrl` extra field (placeholder `https://api.day.app`). Self-hosted servers are first-class, so an Algolia/Grafana stored-id + bounded-wildcard pattern does not apply. GET `/ping` and GET `/info` do not send the device key; POST `/push` is a write. This recipe is not admitted.

Documented operations (not admitted) would send `Accept: application/json` to `https://api.day.app`:

- `healthcheck`: `GET /ping` (pinned credential probe; unauthenticated)
- `server.info`: `GET /info`

Push writes and `device_keys` batch fanout are omitted. Native category is `messaging` (source Communication). `api.day.app` in fixtures is the pinned definition default, not a closed hostname covering self-hosted Bark.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://github.com/Finb/bark-server/blob/master/docs/API_V2.md. Fixtures are independently derived and do not represent live provider access.
