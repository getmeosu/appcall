# ElevenLabs

Read-only international ElevenLabs API recipe. Configure an `xi-api-key` from Developers > API Keys. Healthcheck is documented GET `/v1/user`; text-to-speech, sound generation, and history audio download are omitted because they are billable or binary.

Operations: `healthcheck`, `subscription.get`, `models.list`, `voices.list`, and `voices.get`. `voices.list` uses current GET `/v2/voices` rather than deprecated GET `/v1/voices`. `page_size` and `next_page_token` are caller controlled; provider next tokens are metadata and are never followed. Voice IDs are URI-encoded.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live authentication is unverified.
