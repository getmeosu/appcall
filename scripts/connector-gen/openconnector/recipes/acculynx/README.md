# AccuLynx

AccuLynx API v2 recipe for the US AccuLynx construction CRM. Configure an API key from the AccuLynx API Keys page; the runner sends `Authorization: Bearer` to `https://api.acculynx.com/api/v2`.

Covered HTTP operations include company healthcheck, contact types, lead sources, calendars, contacts, jobs, users, estimates, appointments, job categories, and milestones. EventOnly webhooks cover job created/updated and contact added/changed.

Responses preserve raw AccuLynx JSON under `data`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
