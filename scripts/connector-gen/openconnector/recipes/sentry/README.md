# Sentry

International Sentry REST API recipe. Configure a manually created Sentry access token in the required `accessToken` field; requests use Bearer authentication and the `org:read`, `project:read`, and `event:read` scopes. Read-only operations return raw provider JSON under `data`; live smoke is unverified.
