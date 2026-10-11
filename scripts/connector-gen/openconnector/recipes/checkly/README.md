# Checkly

Checkly Public API recipe for the international Checkly service, version 0.2.0. Configure a user or service API key and the target account ID; the runner sends `Authorization: Bearer` and `x-checkly-account`.

HTTP operations cover checks, check statuses, check results, check groups, alert channels, locations, and dashboards, plus credential-only `healthcheck`. EventOnly webhooks map Checkly alert events `ALERT_FAILURE`, `ALERT_SUCCESS`, and `ALERT_DEGRADED`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live smoke is unverified.
