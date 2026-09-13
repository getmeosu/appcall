# AWS STS

**HOLD.** Official AWS STS AssumeRole Query API requires AWS Signature Version 4. Pinned OpenConnector signs every request with `signAwsSigV4Request` and POSTs to the computed host `https://sts.{region}.amazonaws.com` (default `ap-southeast-1`). Native templates cannot compute SigV4. The pinned credential validator is a local field check, not a cheap authenticated read. This recipe is not admitted.

Documented operations (not admitted) would POST `application/x-www-form-urlencoded` `Action=AssumeRole` to `https://sts.amazonaws.com/`:

- `healthcheck` / `roles.assume`: `POST /` with `RoleArn` (and optional `RoleSessionName`)

`sts.amazonaws.com` in fixtures is the official Query-API example host, not an unsigned product endpoint. STS responses are XML; native `responseFormat` is JSON. Native category is `dev-tools` (source Security/Developer Tools).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html and https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html. Fixtures are independently derived and do not represent live provider access.
