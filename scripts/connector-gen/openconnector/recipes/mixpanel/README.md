# Mixpanel

International Mixpanel Query API plus ingestion import/engage. Configure a service account username, secret, and project id. The runner sends HTTP Basic authentication to `https://mixpanel.com` and `https://api.mixpanel.com`.

Covered operations: credential healthcheck, saved cohorts/funnels, Insights/retention/segmentation/events/JQL/profile queries, annotations, activity stream, event import, profile updates, plus EventOnly `webhook.alert` and `webhook.cohort`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Live smoke is unverified.
