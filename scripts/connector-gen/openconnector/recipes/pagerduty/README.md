# PagerDuty reviewed recipe

Read-only PagerDuty REST API recipe for the current user endpoint. Configure a personal PagerDuty REST API token created for the user who will access the account; account-level credentials are not supported for this endpoint. Requests use `Authorization: Token token=<personal-token>` and the PagerDuty API v2 `Accept` header. Live authentication remains unverified.
