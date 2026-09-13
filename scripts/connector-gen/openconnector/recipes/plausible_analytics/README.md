# Plausible Analytics

Read-only Plausible Stats API v2 connector for the hosted `plausible.io`
edition. Configure a Business plan/team-scoped Stats API key and a site in the
same Plausible team. Healthcheck issues a
fixed minimal `POST /api/v2/query` visitors query; query operations preserve
the provider JSON response under `data`.

This recipe supports relative date ranges only and requests the bounded first
10,000 rows; pagination controls are intentionally not exposed. Live
authentication remains unverified.

Upstream attribution: [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
