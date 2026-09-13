# Asana

**HOLD.** Official Asana REST API documents Personal Access Tokens (Bearer) as well as OAuth, so this is not an OAuth-only edition. Catalog admission extracts action IDs only from `src/providers/asana/actions.ts`, which does not exist; actions live in split `actions-*.ts` files. This lane cannot add a `reviewed-action-ids` row. The recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer` to `https://app.asana.com/api/1.0`:

- `healthcheck`: `GET /users/me?opt_fields=name,email`
- `workspaces.list`: `GET /workspaces`
- `users.get`: `GET /users/{userId}`
- `projects.get`: `GET /projects/{projectId}`
- `project-tasks.list`: `GET /projects/{projectId}/tasks`

Native category is `productivity`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.asana.com/docs/personal-access-token. Fixtures are independently derived and do not represent live provider access.
