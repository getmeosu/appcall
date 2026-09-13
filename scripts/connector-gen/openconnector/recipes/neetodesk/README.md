# NeetoDesk

HOLD. Read-only NeetoDesk external v2 API recipe is authored with Algolia-style required stored `subdomain` interpolating `https://{{subdomain}}.neetodesk.com/api/external/v2` and `allowedHosts` `*.neetodesk.com`, plus `X-Api-Key`. Native compile on bun 1.3.8 dead-code-eliminates setup-field registration in `assertTemplatedHostsAreDeclared`, so the bounded wildcard host cannot be proven. Do not treat this as APPROVED.

Covered operations: credential-only `healthcheck` (`GET /tickets?page_number=1&page_size=1`), `tickets.list`, `tickets.get`, `comments.list`, and `team-members.list`. Writes, attachments, reports, and v1 public paths are omitted. Native returns raw NeetoDesk JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://apidocs.neetodesk.com/api/authentication. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
