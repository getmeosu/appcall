# ReadMe

Read-only ReadMe project, version, category, and document operations using an API key with HTTP Basic authentication. ReadMe API keys are configured in the dashboard. The healthcheck reads project metadata with empty operation input. Pagination and version headers are explicit; provider links are never followed. This recipe targets the legacy ReadMe API v1 project model: ReadMe's official `get-doc` and `get-categories` documentation says API v1 is unavailable for Refactored projects, so Refactored projects are outside this recipe's scope.

Source: [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned to `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Live smoke: configure a ReadMe API key, run `healthcheck`, then `project.get`, `versions.list`, `categories.list`, and `docs.get` with a known slug.
