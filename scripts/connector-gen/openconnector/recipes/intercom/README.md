# Intercom

International Intercom read recipe using the US API host `api.intercom.io` and an API token in `Authorization`; EU/AU regional hosts are documented by Intercom but are outside this fixed-host recipe. It covers credential-only `healthcheck`, `admins.list`, `contacts.list`, and `companies.list`. Contacts use `per_page` and `starting_after`; companies use POST `/companies/list` with bounded page/per_page/order/starting_after. Source attribution: Oomol Open Connector, pinned revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Live smoke: supply a Intercom API token and call `healthcheck`, then one list operation. Live evidence remains unverified.
