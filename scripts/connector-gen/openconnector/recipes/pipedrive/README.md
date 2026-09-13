# Pipedrive

Global Pipedrive CRM read recipe using an API token in `x-api-token`. It covers credential-only `healthcheck`, `persons.list`, `organizations.list`, and `deals.list`. `limit` is bounded to 100 and the v2 opaque `cursor` is caller supplied; provider pagination links are returned as raw JSON and never followed. Source attribution: Oomol Open Connector, pinned revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Live smoke: supply a Pipedrive API token and call `healthcheck`, then one list operation. Live evidence remains unverified.
