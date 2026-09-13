# Bitbucket

This recipe is **HOLD**. Official international Bitbucket Cloud REST API 2.0 at `https://api.bitbucket.org/2.0` (Atlassian). Pinned OpenConnector authentication is OAuth 2.0 only (`https://bitbucket.org/site/oauth2/authorize` and `/access_token`). Native recipe auth cannot express `authorizeUrl` / `tokenUrl`. Do not invent an API-key mapping.

Official docs also describe API tokens (Basic email+token; app passwords deprecated 2026-06-09) and repository access tokens. Those are a different auth shape from the pinned `oauth2` connector and are not used here.

Covered operations (not admitted): `healthcheck` and `user.get` (`GET /2.0/user`), `workspaces.get` (`GET /2.0/workspaces/{workspace}`), `repositories.get` (`GET /2.0/repositories/{workspace}/{repository}`). Paginated list helpers are omitted because the static parser only sees `defineProviderAction` IDs. Writes, pipelines, pull requests, and the deprecated issue tracker are omitted.

Native category is `dev-tools` (source Developer Tools). Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.atlassian.com/cloud/bitbucket/rest/api-group-users/#api-user-get. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
