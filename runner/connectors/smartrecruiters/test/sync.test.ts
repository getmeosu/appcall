import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeCandidatesGetSync,
  executeUsersListSync,
} from "../src/sync";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import usersFixture from "../fixtures/users_list.json";

// Every request is served by an injected fetch. No real network.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixture-smart-token" };

describe("SmartRecruiters jobs.list sync", () => {
  test("requests the documented endpoint on the allowed host", async () => {
    const { calls, impl } = stubFetch('{"content":[{"id":"j1","name":"Engineer"}],"totalFound":1}');

    await executeJobsListSync({ company: "acme", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.smartrecruiters.com");
    expect(url.pathname).toBe("/v1/companies/acme/postings");
    expect(calls[0].method).toBe("GET");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch('{"error":"nope"}', { status: 500 });

    await expect(executeJobsListSync({ company: "acme", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "30" } });

    await expect(executeJobsListSync({ company: "acme", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ company: "acme", fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });

  test("rejects a tenant value that would steer the request off-host", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(
      executeJobsListSync({
        company: "evil.example.net/",
        fetch: impl,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("SmartRecruiters candidates.list sync", () => {
  test("GETs /candidates with X-SmartToken on api host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.smartrecruiters.com");
    expect(url.pathname).toBe("/candidates");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("x-smarttoken")).toBe("fixture-smart-token");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("sr-candidate:cand-001");
    expect(result.candidates[0].name).toBe("Ada Lovelace");
    expect(result.total).toBe(2);
    expect(result.nextPageId).toBe("next-page-token-abc");
  });

  test("forwards limit/pageId/q/jobId/status/updatedAfter filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      limit: 25,
      pageId: "page-2",
      q: "ada",
      jobId: "job-100",
      status: "IN_REVIEW",
      updatedAfter: "2024-01-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("pageId")).toBe("page-2");
    expect(url.searchParams.get("q")).toBe("ada");
    expect(url.searchParams.get("jobId")).toBe("job-100");
    expect(url.searchParams.get("status")).toBe("IN_REVIEW");
    expect(url.searchParams.get("updatedAfter")).toBe("2024-01-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects missing apiKey before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCandidatesListSync({ apiKey: "", fetch: impl })).rejects.toThrow(/apiKey/);
    expect(calls).toHaveLength(0);
  });
});

describe("SmartRecruiters candidates.get sync", () => {
  test("GETs /candidates/{id} with X-SmartToken", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateGetFixture));

    const result = await executeCandidatesGetSync({ ...auth, id: "cand-001", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.smartrecruiters.com");
    expect(url.pathname).toBe("/candidates/cand-001");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("x-smarttoken")).toBe("fixture-smart-token");
    expect(result.candidate?.id).toBe("sr-candidate:cand-001");
    expect(result.candidate?.phoneNumber).toBe("+44-20-555-0100");
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCandidatesGetSync({ ...auth, id: "../evil", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("rejects missing id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCandidatesGetSync({ ...auth, id: "", fetch: impl })).rejects.toThrow(/id/);
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 404 });
    await expect(
      executeCandidatesGetSync({ ...auth, id: "missing", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("SmartRecruiters users.list sync", () => {
  test("GETs /users with X-SmartToken on api host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    const result = await executeUsersListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.smartrecruiters.com");
    expect(url.pathname).toBe("/users");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("x-smarttoken")).toBe("fixture-smart-token");
    expect(result.users).toHaveLength(2);
    expect(result.users[0].id).toBe("sr-user:user-001");
    expect(result.users[0].email).toBe("recruiter.one@example.com");
    expect(result.users[0].active).toBe(true);
    expect(result.total).toBe(2);
  });

  test("forwards limit/offset/q/updatedAfter filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    await executeUsersListSync({
      ...auth,
      limit: 50,
      offset: 10,
      q: "recruiter",
      updatedAfter: "2024-01-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("10");
    expect(url.searchParams.get("q")).toBe("recruiter");
    expect(url.searchParams.get("updatedAfter")).toBe("2024-01-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 401 });
    await expect(executeUsersListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

