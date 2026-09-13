# ClickUp

Read-only international ClickUp API v2 recipe. Generate a personal API token in ClickUp Settings → Apps and store it as `apiKey`. Requests send `Authorization: {token}` (no Bearer prefix) plus `Accept: application/json` to `https://api.clickup.com/api/v2`. OAuth 2.0 is documented but not required; this recipe uses the personal-token shape.

## Operations

- `healthcheck`: `GET /user` with empty input (pinned credential validator).
- `workspaces.list`: `GET /team`.
- `spaces.list`: `GET /team/{workspaceId}/space` with required `workspaceId` and optional `archived`.
- `lists.get`: `GET /list/{listId}`.
- `tasks.get`: `GET /task/{taskId}` with optional `includeSubtasks` and `includeMarkdownDescription`.

Writes, multipart attachments, in-process `list_workspace_users` filtering of `GET /team`, and v3 `move_task_to_home_list` are omitted. Native returns raw ClickUp JSON under `data`. Native category is `productivity`.

## Adaptations

Pinned source and official docs agree on `https://api.clickup.com/api/v2` and personal-token `Authorization` without Bearer. Native omits the upstream user-agent and the source `Content-Type` on GET. April 2026 feature-flag email/token exposure is recorded under the 2026-09-13 waiver.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.clickup.com/docs/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
