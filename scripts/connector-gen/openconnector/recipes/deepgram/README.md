# Deepgram

Read-only international Deepgram Management API recipe. Configure an API key sent as `Authorization: Token <key>`. Healthcheck is documented GET `/v1/projects`; listen/speak synthesis is omitted because it is billable.

Operations: `healthcheck`, `projects.list`, `projects.get`, `models.list`, and `models.get`. Optional `includeOutdated` is sent as `include_outdated=true|false`. Project and model IDs are URI-encoded. Provider URLs are never followed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live authentication is unverified.
