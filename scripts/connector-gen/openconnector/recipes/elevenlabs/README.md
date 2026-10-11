# ElevenLabs

Composio ELEVENLABS parity recipe: 155 tools from toolkit version 20260930_00. Configure an `xi-api-key`. Healthcheck is Composio `ELEVENLABS_GET_USER_INFO` (GET `/v1/user`). `ELEVENLABS_GET_A_PROFILE_PAGE` is a separate operation on the same path.

File-upload tools put the documented fields in a JSON body. The declarative compiler does not encode multipart. Binary audio, archive, and HTML routes keep the official method and path; fixture replay uses a JSON envelope because `responseFormat` is `json`.

`POST /v1/voice-generation/generate-voice`, `POST /v1/voice-generation/create-voice`, `GET /v1/voice-generation/generate-voice/parameters`, and `GET /v1/workspace/{workspace_id}/sso-provider` follow Composio and are absent from the current ElevenLabs OpenAPI. `admin_url_prefix` is a query parameter, not a host.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live authentication is unverified.
