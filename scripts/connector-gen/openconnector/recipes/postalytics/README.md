# Postalytics

International Postalytics REST API v1 recipe covering origin healthcheck plus every Composio `POSTALYTICS_*` HTTP tool (24 tools, 26 operations). `healthcheck` is the authenticated `GET /account/me` probe and maps to `POSTALYTICS_GET_MY_ACCOUNT`. Origin `campaigns.list` (`GET /campaigns`) and `templates.list` (`GET /templates`) are kept even though they are not Composio slugs. Drip campaigns are a separate official endpoint, `GET /campaigns/drips`.

Configure the API key from the Connect section of the Postalytics account. The runner sends HTTP Basic authentication with the API key as the username and a blank password to `https://api.postalytics.com/api/v1`, plus `Accept: application/json`.

## Operations

- Auth / account: `healthcheck` (`GET /account/me`), `accounts.create`, `accounts.update`, `accounts.delete`, `integrations.list`.
- Campaigns: `campaigns.list`, `campaigns.drips.list`, `campaigns.create`, `campaigns.delete`.
- Contacts: `contact_lists.list`, `contacts.list`, `contacts.create`.
- Templates: `templates.list`, `templates.create`.
- Flows: `flows.list`.
- Webhooks: `webhooks.list`, `webhooks.create` (outbound registration; Composio triggers = 0).
- Suppression lists: `suppression_lists.list`, `suppression_lists.get`, `suppression_lists.create`, `suppression_lists.delete`.
- Suppression contacts: `suppression_list_contacts.list`, `suppression_list_contacts.get`, `suppression_list_contacts.create`, `suppression_list_contacts.update`, `suppression_list_contacts.delete`.

Successful JSON responses are raw Postalytics JSON under AppCall `data`. List endpoints that return JSON arrays use `outputSchema.data` as array. Optional query/body fields are omitted when unset. `webhooks.create` uses official `campaign_name` (Composio `name`). Production host only; `api-dev.postalytics.com` is omitted. The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.postalytics.com/getting-started/authentication-0 and https://docs.postalytics.com/references/postalytics-rest-api/get-my-account. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `campaigns.list`.
