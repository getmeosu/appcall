# Ayrshare

Read-only international Ayrshare REST recipe. Configure the Primary Profile API key from https://app.ayrshare.com/api-key. The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.ayrshare.com/api`. Optional User Profile `profileKey` is sent as `Profile-Key` only when configured.

Healthcheck is documented GET `/user`. Publish, delete, update, retry, analytics, and media validation writes or POSTs are omitted.

Operations: `healthcheck`, `user.get`, `posts.history`, and `posts.get`. `user.get` accepts optional `instagramDetails`. History filters (`limit` 1-1000, `lastDays` >= 0, `status`, `type`, `startDate`, `endDate`, `autoRepostId`, comma-separated `platforms`) are caller controlled; cache timestamps are metadata and are never followed. Post IDs are URI-encoded.

`platforms` is a comma-separated string because the pinned source joins the array on the wire and native templates cannot join arrays.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
