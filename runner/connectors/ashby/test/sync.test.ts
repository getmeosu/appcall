import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeApplicationsListSync,
  executeCandidatesGetSync,
} from "../src/sync";
import candidatesFixture from "../fixtures/candidates_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
import candidateInfoFixture from "../fixtures/candidate_info.json";

// Every request is served by an injected fetch. No real network.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };

describe("Ashby jobs.list sync", () => {
  test("requests the documented endpoint on the allowed host", async () => {
    const { calls, impl } = stubFetch('{"jobs":[{"id":"j1","title":"Engineer"}]}');

    await executeJobsListSync({ boardName: "acme", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.ashbyhq.com");
    expect(url.pathname).toBe("/posting-api/job-board/acme/jobs");
    expect(calls[0].method).toBe("GET");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch('{"error":"nope"}', { status: 500 });

    await expect(executeJobsListSync({ boardName: "acme", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{ }".replace(" ", ""), { status: 429, headers: { "retry-after": "30" } });

    await expect(executeJobsListSync({ boardName: "acme", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ boardName: "acme", fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });

  test("rejects a tenant value that would steer the request off-host", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(
      executeJobsListSync({
        boardName: "evil.example.net/",
        fetch: impl,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby candidates.list sync", () => {
  test("POSTs /candidate.list with Basic auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.ashbyhq.com");
    expect(url.pathname).toBe("/candidate.list");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("fixturekey:", "utf8").toString("base64")}`,
    );
    expect(calls[0].headers.get("content-type")).toBe("application/json");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("ash-candidate:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.moreDataAvailable).toBe(true);
    expect(result.nextCursor).toBe("cursor-page-2");
  });

  test("forwards limit/cursor/syncToken/createdAfter in JSON body", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      limit: 25,
      cursor: "cur_1",
      syncToken: "tok_1",
      createdAfter: "2024-01-01T00:00:00.000Z",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      limit: 25,
      cursor: "cur_1",
      syncToken: "tok_1",
      createdAfter: "2024-01-01T00:00:00.000Z",
    });
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies success=false JSON as upstream error", async () => {
    const { impl } = stubFetch(
      JSON.stringify({ success: false, errors: [{ message: "permission denied" }] }),
    );
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("permission denied"),
    });
  });

  test("rejects missing apiKey before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCandidatesListSync({ apiKey: "", fetch: impl })).rejects.toThrow(/apiKey/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby applications.list sync", () => {
  test("POSTs /application.list with Basic auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    const result = await executeApplicationsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.ashbyhq.com");
    expect(url.pathname).toBe("/application.list");
    expect(calls[0].method).toBe("POST");
    expect(result.applications).toHaveLength(2);
    expect(result.applications[0].id).toBe(
      "ash-application:e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
    );
    expect(result.moreDataAvailable).toBe(false);
  });

  test("forwards limit/cursor/status/jobId in JSON body", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    await executeApplicationsListSync({
      ...auth,
      limit: 10,
      cursor: "c2",
      status: "Active",
      jobId: "4071538b-3cac-4fbf-ac76-f78ed250ffdd",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      limit: 10,
      cursor: "c2",
      status: "Active",
      jobId: "4071538b-3cac-4fbf-ac76-f78ed250ffdd",
    });
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeApplicationsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Ashby candidates.get sync", () => {
  test("POSTs /candidate.info with id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateInfoFixture));

    const result = await executeCandidatesGetSync({
      ...auth,
      id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/candidate.info");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e" });
    expect(result.candidate!.id).toBe("ash-candidate:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.candidate!.name).toBe("Adam Hart");
  });

  test("accepts externalMappingId instead of id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateInfoFixture));

    await executeCandidatesGetSync({
      ...auth,
      externalMappingId: "hris-99",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ externalMappingId: "hris-99" });
  });

  test("requires id or externalMappingId", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCandidatesGetSync({ ...auth, fetch: impl })).rejects.toThrow(
      /id or externalMappingId/,
    );
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 404 });
    await expect(
      executeCandidatesGetSync({ ...auth, id: "missing", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
