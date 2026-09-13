# Bluesky

This recipe is **HOLD**. Official international Bluesky / AT Protocol API at `https://bsky.social` (Bluesky Social PBC, United States). Pinned authentication is a handle plus app password exchanged via `POST /xrpc/com.atproto.server.createSession` for an `accessJwt`. Native recipe auth cannot express that login-then-bearer session, and native oauth cannot express AT Protocol OAuth for apps. Do not treat the app password as a static Bearer token.

Covered operations (not admitted): `healthcheck` and `timeline.get` (`GET /xrpc/app.bsky.feed.getTimeline`), `profile.get` (`GET /xrpc/app.bsky.actor.getProfile`), and `posts.search` (`GET /xrpc/app.bsky.feed.searchPosts`). Writes (`create_text_post`), array `tag` filters, and self-hosted PDS hosts are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.bsky.app/docs/api/com-atproto-server-create-session and https://atproto.com/guides/sdk-auth. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
