# Ably

International **Ably REST API** recipe covering origin healthcheck plus every Composio `ABLY_*` HTTP tool (25 tools, 26 operations; healthcheck is an authenticated `GET /stats?limit=1` probe and is not a Composio slug).

Store the API key as split `keyName` (appId.keyId) and `keySecret` fields. Requests send HTTP Basic `Authorization` to `https://main.realtime.ably.net`.

## Operations

- Auth / utility: `healthcheck`, `stats.get`, `time.get`, `tokens.request`.
- Channels: `channels.list`, `channels.get`.
- Messages: `messages.publish`, `messages.history`, `messages.versions`, `messages.batch_publish`.
- Presence: `presence.list`, `presence.history`, `presence.batch`, `presence.batch_history`.
- Push devices: `push.devices.register`, `push.devices.get`, `push.devices.list`, `push.devices.patch`, `push.devices.update`, `push.devices.unregister`, `push.devices.unregister_all`.
- Push channels: `push.channels.list`, `push.channel_subscriptions.list`, `push.channel_subscriptions.delete`, `push.publish`, `push.batch_publish`.

Successful JSON responses are raw Ably JSON under AppCall `data`. Publish/delete endpoints that return an empty body use a static envelope (`published`, `deleted`, or `unregistered`). Origin `messages.publish` still echoes `channelId`/`name`. Optional query/body fields are omitted when unset. `presence.batch_history` uses official `GET /presence` with a comma-joined channel list plus history window params.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://ably.com/docs/api/rest-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
