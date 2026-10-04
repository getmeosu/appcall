# ElevenLabs

International ElevenLabs API recipe. Configure an `xi-api-key` from Developers > API Keys. Healthcheck is documented GET `/v1/user`. Binary text-to-speech audio download is omitted; `speech.convertWithTimestamps` returns JSON (`audio_base64` plus alignment).

Operations cover user/subscription/models/voices, voice settings, generated history, shared voices, JSON speech-with-timestamps, conversational agents/conversations/knowledge-base/phone numbers, pronunciation dictionaries, dubbing, and workspace groups. `voices.list` uses current GET `/v2/voices`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live authentication is unverified.
