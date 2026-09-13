# Agora

Read-only international Agora Console REST API recipe. Store the Customer ID and Customer Secret from Agora Console → RESTful API. The runner sends HTTP Basic Auth (`Customer ID` as username, `Customer Secret` as password) to `https://api.agora.io`.

## Operations

- `healthcheck` / `projects.list`: `GET /dev/v1/projects`
- `projects.get`: `GET /dev/v1/project?id={projectId}&name={name}`
- `usage.get`: `GET /dev/v3/usage?project_id=&from_date=&to_date=&business=` with `business` one of `default`, `transcodeDuration`, `recording`, `cloudRecording`, `miniapp`

Project create/status/certificate writes are omitted. The mainland-China REST host `api.sd-rtn.com` is not admitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.agora.io/en/api-reference/api-ref/console/solutions-agora-console-rest-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
