# Bugsnag recipe

Bugsnag Data Access API recipe using a personal auth token in the documented `Authorization: token ...` header. Operations cover the origin/main healthcheck plus organization/project/error reads, and add the remaining Composio BUGSNAG tools (collaborators, teams, events, saved searches, integrations, GDPR data requests, releases, feature flags, pivots, and related writes). Host is `api.bugsnag.com` only; notify/ingest is out of scope. Live authentication remains unverified. Source is Apache-2.0 licensed upstream OpenConnector at the pinned revision.
