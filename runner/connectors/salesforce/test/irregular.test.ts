import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { getFileContent, uploadJobData } from "../src/irregular";

const HOST = "org.my.salesforce.com";
const JOB = "750000000000001AAA";
const VERSION = "068000000000001AAA";
const CSV = "Name\nAcme\n";

describe("salesforce irregular HTTP", () => {
  test("upload job data PUTs raw CSV to the Bulk API 2.0 content URL", async () => {
    let seen: { url: string; method: string; contentType: string | null; body: string | undefined } | undefined;
    const result = await uploadJobData({
      accessToken: "fixture-api-token",
      instance_host: HOST,
      jobId: JOB,
      csv: CSV,
      fetch: async (url: string | URL, init?: RequestInit) => {
        seen = {
          url: String(url),
          method: String(init?.method ?? "GET"),
          contentType: new Headers(init?.headers).get("content-type"),
          body: typeof init?.body === "string" ? init.body : undefined,
        };
        return new Response(null, { status: 201 });
      },
    });
    expect(seen).toEqual({
      url: `https://${HOST}/services/data/v60.0/jobs/ingest/${JOB}/batches`,
      method: "PUT",
      contentType: "text/csv",
      body: CSV,
    });
    expect(result).toEqual({ connector: "salesforce", action: "jobs.ingest_upload", source: "provider", data: null });
  });

  test("upload job data rejects a non-id and a host outside the allowlist", async () => {
    await expect(uploadJobData({ accessToken: "tok", instance_host: HOST, jobId: "../batches", csv: CSV })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(uploadJobData({ accessToken: "tok", instance_host: "evil.example:443", jobId: JOB, csv: CSV })).rejects.toMatchObject({
      code: "OUTBOUND_INVALID_URL",
    });
    await expect(uploadJobData({
      accessToken: "tok",
      instance_host: "evil.example.com",
      jobId: JOB,
      csv: CSV,
      fetch: async () => new Response(null, { status: 201 }),
    })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  test("upload job data surfaces rate limits and non-201 statuses", async () => {
    await expect(uploadJobData({
      accessToken: "tok",
      instance_host: HOST,
      jobId: JOB,
      csv: CSV,
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
    await expect(uploadJobData({
      accessToken: "tok",
      instance_host: HOST,
      jobId: JOB,
      csv: CSV,
      fetch: async () => new Response("no", { status: 400 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("file content GETs VersionData and returns base64 bytes", async () => {
    const payload = Uint8Array.from([0, 255, 254]);
    let seen: { url: string; method: string; accept: string | null } | undefined;
    const result = await getFileContent({
      accessToken: "fixture-api-token",
      instance_host: HOST,
      contentVersionId: VERSION,
      fetch: async (url: string | URL, init?: RequestInit) => {
        seen = {
          url: String(url),
          method: String(init?.method ?? "GET"),
          accept: new Headers(init?.headers).get("accept"),
        };
        return new Response(payload, { status: 200, headers: { "content-type": "application/pdf" } });
      },
    });
    expect(seen).toEqual({
      url: `https://${HOST}/services/data/v60.0/sobjects/ContentVersion/${VERSION}/VersionData`,
      method: "GET",
      accept: "*/*",
    });
    expect(result).toEqual({
      connector: "salesforce",
      action: "files.version_data",
      source: "provider",
      data: {
        encoding: "base64",
        contentType: "application/pdf",
        bytes: Buffer.from(payload).toString("base64"),
      },
    });
  });

  test("file content blocks redirects and oversize bodies", async () => {
    await expect(getFileContent({
      accessToken: "tok",
      instance_host: HOST,
      contentVersionId: VERSION,
      fetch: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }),
    })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    const limit = manifest.operations["files.version_data"].maxResponseBytes;
    await expect(getFileContent({
      accessToken: "tok",
      instance_host: HOST,
      contentVersionId: VERSION,
      fetch: async () => new Response(new Uint8Array(limit + 1), { status: 200 }),
    })).rejects.toMatchObject({ code: "OUTBOUND_RESPONSE_TOO_LARGE" });
  });

  test("missing credentials validate without calling Salesforce", async () => {
    await expect(uploadJobData({ jobId: JOB, csv: CSV })).resolves.toMatchObject({
      source: "connector",
      validated: { jobId: JOB, csv: CSV },
    });
    await expect(getFileContent({ contentVersionId: VERSION })).resolves.toMatchObject({
      source: "connector",
      validated: { contentVersionId: VERSION },
    });
    await expect(getFileContent({ contentVersionId: "not-an-id" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });
});
