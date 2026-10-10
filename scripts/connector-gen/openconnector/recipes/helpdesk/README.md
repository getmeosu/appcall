# HelpDesk

HelpDesk.com REST API v1 recipe for Text S.A. (formerly LiveChat Software S.A., Wroclaw). This is the HelpDesk.com ticketing product at `www.helpdesk.com` / `api.helpdesk.com`, not Freshdesk, Zendesk, or a generic helpdesk alias.

Configure the HelpDesk account ID (non-secret) and a Personal Access Token. The runner sends HTTP Basic authentication with account ID as username and the token as password to `https://api.helpdesk.com`.

Covered HTTP operations (v0.2.0): `healthcheck`, ticket list/get/create/update/delete/silo, agent list/get, team list/get/create, tag list/get/create, canned response list/get, views.list, macros.list, webhooks.list, licenses.list, and customFields.list. EventOnly webhooks: `webhook.tickets_create`, `webhook.tickets_update`, `webhook.tickets_events_status`, `webhook.tickets_events_message`, `webhook.tickets_events_assignment`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.helpdesk.com/. Fixtures are independently derived and do not represent live provider access.
