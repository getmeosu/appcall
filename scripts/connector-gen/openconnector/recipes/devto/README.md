# DEV Community

Forem / DEV Community API v1 recipe. Store a user API key from DEV settings as `apiKey`. Requests send `api-key` and `Accept: application/vnd.forem.api-v1+json` to `https://dev.to/api`.

Covered HTTP operations include user identity, article list/get/create/update, comments, followers, tags, reading list, organizations, videos, podcasts, and webhook CRUD, plus EventOnly webhooks for article_created, article_updated, and comment_created.

Official docs: https://developers.forem.com/api/v1.
