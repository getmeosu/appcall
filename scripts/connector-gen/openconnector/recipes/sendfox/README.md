# SendFox

International SendFox API recipe using a personal access token as `Authorization: Bearer <apiKey>`.

Operations are bounded, caller-paginated reads: `healthcheck`, `contacts.list`, `contacts.get`, `lists.list`, `lists.get`, and `contactsInList.list`. Provider next links are returned as data and never followed automatically. Live authentication remains unverified.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
