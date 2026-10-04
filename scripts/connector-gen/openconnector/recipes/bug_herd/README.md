# BugHerd

BugHerd API v2 recipe for Splitrock Studio Pty Ltd (Australia). Configure the organization API key from BugHerd Settings > General Settings. The runner sends HTTP Basic authentication with the API key as username and `x` as the password, matching official docs.

Covered HTTP operations include organization healthcheck, project/task/comment/user/column/attachment/webhook list-get-create-update-delete, plus EventOnly webhooks for `task_create`, `task_update`, `task_destroy`, `comment`, and `project_create`.

Official docs live at `https://docs.bugherd.com/api` (also linked as `https://www.bugherd.com/api_v2`). Host is `www.bugherd.com`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access.
