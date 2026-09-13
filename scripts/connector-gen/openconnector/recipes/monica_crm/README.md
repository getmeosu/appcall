# Monica CRM

Read-only international Monica hosted personal CRM recipe. Create a personal OAuth token from Monica API settings on the hosted product at `https://app.monicahq.com`. The runner sends `Authorization: Bearer {token}` and `Accept: application/json` to `https://app.monicahq.com/api`.

Monica also offers a self-hosted edition. This recipe admits only the hosted host used by the pinned source. Caller-supplied self-hosted instance URLs are not admitted.

## Operations

- `healthcheck`: `GET /me` with empty input (pinned credential validator).
- `contacts.list`: `GET /contacts` with optional `page`, `limit`, `query`, and `sort`.
- `contacts.get`: `GET /contacts/{contactId}`.
- `notes.list`: `GET /notes` with optional `page` and `limit`.
- `notes.get`: `GET /notes/{noteId}`.

Note/contact writes and the contact-scoped `GET /contacts/{contactId}/notes` path switch are omitted. Native returns the raw Monica JSON envelope under `data`.

## Adaptations

Official API index at `/api` 404s as of 2026-09-13; remaining resource pages such as `/api/tasks` still document the same `/api` envelope and `app.monicahq.com` host used by contacts and notes. Native category is `crm`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.monicahq.com/api/tasks and https://www.monicahq.com/en/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure a personal OAuth token, call `healthcheck` with `{}`, then `contacts.list`.
