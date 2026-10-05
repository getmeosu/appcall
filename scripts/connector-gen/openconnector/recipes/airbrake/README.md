# Airbrake reviewed recipe

Airbrake API v4 using the documented User API key query parameter `key`. Live access is unverified.

## Operations

- `healthcheck` / `projects.list`: `GET /api/v4/projects`.
- `projects.get`: `GET /api/v4/projects/{projectId}`.
- `groups.list`: `GET /api/v4/projects/{projectId}/groups`.
- `groups.get`: `GET /api/v4/projects/{projectId}/groups/{groupId}`.
- `groups.mute`: `PUT /api/v4/projects/{projectId}/groups/{groupId}/muted`.
- `groups.unmute`: `PUT /api/v4/projects/{projectId}/groups/{groupId}/unmuted`.
- `groups.delete`: `DELETE /api/v4/projects/{projectId}/groups/{groupId}`.
- `groups.listAll`: `GET /api/v4/groups`.
- `notices.list`: `GET /api/v4/projects/{projectId}/groups/{groupId}/notices`.
- `notices.get`: `GET /api/v4/projects/{projectId}/groups/{groupId}/notices/{noticeId}`.
- `deploys.list`: `GET /api/v4/projects/{projectId}/deploys`.
- `deploys.get`: `GET /api/v4/projects/{projectId}/deploys/{deployId}`.
- `deploys.create`: `POST /api/v4/projects/{projectId}/deploys`.
- `activities.list`: `GET /api/v4/projects/{projectId}/activities`.
- `webhook.error` / `webhook.deploy`: EventOnly inbound webhooks for new/reoccurring errors and tracked deploys.

Fixtures use the deterministic token `fixture-api-token`.
