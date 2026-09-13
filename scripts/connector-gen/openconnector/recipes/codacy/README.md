# Codacy

Use an account API token from Codacy User settings (repository tokens do not authorize the account `/user` healthcheck). The connector sends `api-token` to `https://app.codacy.com/api/v3` and performs bounded read operations only. Provider, organization, repository, cursor, search, segments, and limit inputs are validated before fetch; pagination links are returned as data and never followed.

Source and dated research evidence are pinned in `recipe.json`; live authentication remains unverified.
