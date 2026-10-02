import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeStagesListSync,
  executeMembersListSync,
} from "../src/sync";
import candidatesFixture from "../fixtures/candidates_list.json";
import stagesFixture from "../fixtures/stages_list.json";
import membersFixture from "../fixtures/members_list.json";

// Every request is served by an injected fetch. No real network.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { account: "acme", accessToken: "tok_secret_value" };

describe("Workable jobs.list sync", () => {
  test("requests the SPI jobs endpoint on the account subdomain", async () => {
    const { calls, impl } = stubFetch('{"jobs":[{"id":"j1","title":"Engineer"}]}');

    await executeJobsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("acme.workable.com");
    expect(url.pathname).toBe("/spi/v3/jobs");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("authorization")).toBe("Bearer tok_secret_value");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch(`{"error":"nope"}`, { status: 500 });

    await expect(executeJobsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "30" } });

    await expect(executeJobsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });

  test("rejects a tenant value that would steer the request off-host", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(
      executeJobsListSync({ ...auth, account: "evil.example.net/", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Workable candidates.list sync", () => {
  test("GETs /spi/v3/candidates on the account host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("acme.workable.com");
    expect(url.pathname).toBe("/spi/v3/candidates");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("wk-candidate:ce4da98");
    expect(result.next).toContain("/candidates?");
  });

  test("forwards email/shortcode/stage/limit/sinceId/maxId/createdAfter/updatedAfter", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      email: "a@b.com",
      shortcode: "GROOV005",
      stage: "interview",
      limit: 10,
      sinceId: "abc",
      maxId: "zzz",
      createdAfter: "2015-01-01T00:00:00Z",
      updatedAfter: "2015-06-01T00:00:00Z",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("email")).toBe("a@b.com");
    expect(url.searchParams.get("shortcode")).toBe("GROOV005");
    expect(url.searchParams.get("stage")).toBe("interview");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("since_id")).toBe("abc");
    expect(url.searchParams.get("max_id")).toBe("zzz");
    expect(url.searchParams.get("created_after")).toBe("2015-01-01T00:00:00Z");
    expect(url.searchParams.get("updated_after")).toBe("2015-06-01T00:00:00Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Workable stages.list sync", () => {
  test("GETs /spi/v3/stages on the account host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(stagesFixture));

    const result = await executeStagesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("acme.workable.com");
    expect(url.pathname).toBe("/spi/v3/stages");
    expect(result.stages).toHaveLength(6);
    expect(result.stages[0].id).toBe("wk-stage:sourced");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeStagesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Workable members.list sync", () => {
  test("GETs /spi/v3/members on the account host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(membersFixture));

    const result = await executeMembersListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("acme.workable.com");
    expect(url.pathname).toBe("/spi/v3/members");
    expect(result.members).toHaveLength(2);
    expect(result.members[0].id).toBe("wk-member:3dae6411");
  });

  test("forwards limit/sinceId/maxId/role/shortcode/email/name/status", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(membersFixture));

    await executeMembersListSync({
      ...auth,
      limit: 25,
      sinceId: "aaa",
      maxId: "zzz",
      role: "admin",
      shortcode: "GROOV005",
      email: "john@example.com",
      name: "John Doe",
      status: "active",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("since_id")).toBe("aaa");
    expect(url.searchParams.get("max_id")).toBe("zzz");
    expect(url.searchParams.get("role")).toBe("admin");
    expect(url.searchParams.get("shortcode")).toBe("GROOV005");
    expect(url.searchParams.get("email")).toBe("john@example.com");
    expect(url.searchParams.get("name")).toBe("John Doe");
    expect(url.searchParams.get("status")).toBe("active");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 401 });
    await expect(executeMembersListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
