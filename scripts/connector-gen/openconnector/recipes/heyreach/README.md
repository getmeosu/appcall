# HeyReach

International **HeyReach Public API** recipe covering origin healthcheck plus every Composio `HEYREACH_*` HTTP tool (19 tools, 21 operations). Healthcheck is an authenticated `POST /campaign/GetAll` probe (offset=0, limit=1) because official `GET /auth/CheckApiKey` returns an empty 200 body; `auth.check` maps that endpoint with a static `{data:{valid:true}}` envelope. `campaigns.get` is kept from origin and is not a Composio slug.

Create an API key in HeyReach Settings → Integrations / API and store it as `apiKey`. Requests send `X-API-KEY` and `Accept`/`Content-Type: application/json` to `https://api.heyreach.io/api/public`.

## Operations

- Auth: `healthcheck` (`POST /campaign/GetAll`), `auth.check` (`GET /auth/CheckApiKey`).
- Campaigns: `campaigns.list`, `campaigns.get`.
- Lists: `lists.list`, `lists.create`, `lists.leads.list`, `lists.leads.add`, `lists.companies.list`, `lists.for_lead`.
- Leads / tags: `leads.get`, `tags.create`.
- Accounts / network: `accounts.list`, `network.list`.
- Inbox / stats: `conversations.list`, `stats.get`.
- Webhooks: `webhooks.list`, `webhooks.get`, `webhooks.create`, `webhooks.update`, `webhooks.delete` (outbound registration; Composio triggers = 0).

Successful JSON responses are raw HeyReach JSON under AppCall `data`. Empty 200 bodies (`auth.check`, webhook create/update/delete) use a static result envelope. `stats.get` maps Composio `dateFrom`/`dateTo` to official `startDate`/`endDate`. Optional JSON fields are omitted when unset. List reads use POST JSON bodies as documented. Native category is `crm`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official API: https://docs.heyreach.io and https://documenter.getpostman.com/view/23808049/2sA2xb5F75. Fixtures are independently derived and fixture-only; live smoke is unverified.
