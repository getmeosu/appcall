# Bannerbear

International Bannerbear V2 REST API recipe covering origin healthcheck plus every Composio `BANNERBEAR_*` HTTP tool (33 tools, 33 operations; `healthcheck` is `BANNERBEAR_GET_AUTH`).

## Setup

Configure a project API key from Project → Settings, or a Master API Key from account API keys. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://api.bannerbear.com`. Full Access Master keys should pass optional `project_id` on project-scoped endpoints. V5 keys/endpoints are not expressed.

## Operations

- Auth / account: `healthcheck` (`GET /v2/auth`), `account.get`, `fonts.list`, `effects.list`.
- Projects (Master key): `projects.create`, `projects.list`, `projects.get`, `projects.hydrate`.
- Templates: `templates.list`, `templates.get`, `templates.create`, `templates.delete`, `templates.import`.
- Template sets: `template_sets.create`, `template_sets.list`, `template_sets.get`, `template_sets.update`.
- Signed bases: `signed_bases.create`, `signed_bases.list`.
- Images / GIFs / screenshots / videos / collections: list and get variants present in Composio.
- Video templates: `video_templates.create`, `video_templates.list`.
- Webhooks: `webhooks.create`, `webhooks.get`, `webhooks.delete` (outbound registration; Composio triggers = 0).
- Utilities: `pdfs.join` (`pdf_urls` → official `pdf_inputs`).

Successful JSON responses are raw Bannerbear JSON under AppCall `data`. DELETE maps empty or JSON bodies to `{success: true}`. Optional query/body fields are omitted when unset. The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.bannerbear.com/v2/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
