# Supadata

Read-only international Supadata REST API v1 recipe. Create an API key in the [Supadata dashboard](https://dash.supadata.ai). The runner sends `x-api-key` and `Accept: application/json` to `https://api.supadata.ai/v1`.

## Operations

- `healthcheck`: `GET /me` with empty input (pinned credential validator). Account metadata is not a billable YouTube/search/transcript call.
- `youtube.video.get`: `GET /youtube/video?id=` with required `id` (URL or video ID).
- `youtube.channel.get`: `GET /youtube/channel?id=` with required `id` (URL, handle, or channel ID).
- `youtube.playlist.get`: `GET /youtube/playlist?id=` with required `id`.
- `youtube.channel.videos.list`: `GET /youtube/channel/videos` with required `id` and optional `limit` (1–5000) and `type` (`all` / `video` / `short` / `live`).

YouTube search, transcripts, web scrape, web map, and other credit-consuming extraction endpoints are omitted. Native returns raw Supadata JSON under `data`. Native category is `utility` (source AI/Data is not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source and official docs agree on `https://api.supadata.ai/v1` and the `x-api-key` header. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.supadata.ai/api-reference/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
