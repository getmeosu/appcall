# Amplitude

Read-only curated recipe for Amplitude’s US Dashboard REST API. Configure the API key ID and secret key; Basic auth uses the ID as username and secret as password. Operations are `healthcheck`, `events.list`, `users.search`, and `users.activity`; search accepts a nonempty Amplitude ID, device ID, or user ID, while activity requires a nonempty numeric Amplitude ID.

Upstream docs: https://amplitude.com/docs/apis/analytics/dashboard-rest. Company contact: https://amplitude.com/contact/. The EU endpoint is outside this recipe’s current scope. The April 2–4, 2024 metadata-table deletion was a historical US service outage, recorded at https://status.amplitude.com/incidents/wqcvbp2pcxq4; it is not current breach evidence. Live smoke remains unverified.
