# AWS S3

**HOLD.** Official Amazon S3 REST requires AWS Signature Version 4 request signing. Pinned OpenConnector calls `signAwsSigV4Request` on every request, including ListBuckets credential validation, and builds computed hosts `s3.{region}.amazonaws.com` or `{bucket}.s3.{region}.amazonaws.com`. Native templates cannot express HMAC signing (`Authorization`, `x-amz-date`, `x-amz-content-sha256`) or those computed hosts. This recipe is not admitted.

Documented operations (not admitted) would be:

- `buckets.list`: `GET /` ListBuckets
- `objects.list`: `GET /?list-type=2` ListObjectsV2
- `objects.head`: `HEAD /{objectKey}`

Writes, downloads, deletes, and presigned URLs are omitted. `s3.us-east-1.amazonaws.com` in fixtures is a documentation placeholder, not a signed regional product host. Native category is `dev-tools` (source Storage/Developer Tools). Responses are XML.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html. Fixtures are independently derived and do not represent live provider access.
