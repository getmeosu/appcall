import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeApplicationsListSync,
  executeUsersListSync,
} from "../src/sync";
import candidatesFixture from "../fixtures/candidates_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
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

const auth = { apiKey: "fixturekey" };

describe("Greenhouse jobs.list sync", () => {
  test("requests the documented endpoint on the allowed host", async () => {
    const body = JSON.stringify({ jobs: [{ id: 1, title: "Engineer", absolute_url: "https://acme.example/j1" }] });
    const { calls, impl } = stubFetch(body);

    await executeJobsListSync({ boardToken: "acme", fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("boards-api.greenhouse.io");
    expect(url.pathname).toBe("/v1/boards/acme/jobs");
    expect(calls[0].method).toBe("GET");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch(JSON.stringify({ error: "nope" }), { status: 500 });

    await expect(executeJobsListSync({ boardToken: "acme", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "30" } });

    await expect(executeJobsListSync({ boardToken: "acme", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ boardToken: "acme", fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });

  test("rejects a tenant value that would steer the request off-host", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(
      executeJobsListSync({
        boardToken: "evil.example.net/",
        fetch: impl,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Greenhouse candidates.list sync", () => {
  test("GETs /v1/candidates with Basic auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v1/candidates");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("fixturekey:", "utf8").toString("base64")}`,
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("gh-candidate:53883394");
    expect(result.candidates[0].name).toBe("John Locke");
  });

  test("forwards perPage/page/jobId/email filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      perPage: 50,
      page: 2,
      jobId: 107761,
      email: "test@example.com",
      createdAfter: "2017-01-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("job_id")).toBe("107761");
    expect(url.searchParams.get("email")).toBe("test@example.com");
    expect(url.searchParams.get("created_after")).toBe("2017-01-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects missing apiKey before fetch", async () => {
    const { calls, impl } = stubFetch("[]");
    await expect(executeCandidatesListSync({ apiKey: "", fetch: impl })).rejects.toThrow(/apiKey/);
    expect(calls).toHaveLength(0);
  });
});

describe("Greenhouse applications.list sync", () => {
  test("GETs /v1/applications with Basic auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    const result = await executeApplicationsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v1/applications");
    expect(calls[0].method).toBe("GET");
    expect(result.applications).toHaveLength(2);
    expect(result.applications[0].id).toBe("gh-application:69306314");
    expect(result.applications[0].status).toBe("active");
    expect(result.applications[1].prospect).toBe(true);
  });

  test("forwards perPage/page/jobId/status filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    await executeApplicationsListSync({
      ...auth,
      perPage: 25,
      page: 1,
      jobId: 107761,
      status: "active",
      lastActivityAfter: "2017-09-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("per_page")).toBe("25");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("job_id")).toBe("107761");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("last_activity_after")).toBe("2017-09-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeApplicationsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Greenhouse users.list sync", () => {
  test("GETs /v1/users with Basic auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    const result = await executeUsersListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v1/users");
    expect(calls[0].method).toBe("GET");
    expect(result.users).toHaveLength(2);
    expect(result.users[0].id).toBe("gh-user:1049756");
    expect(result.users[0].primaryEmail).toBe("integrationuser@example.com");
    expect(result.users[0].siteAdmin).toBe(true);
  });

  test("forwards perPage/page/email/employeeId filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    await executeUsersListSync({
      ...auth,
      perPage: 10,
      page: 3,
      email: "admin@example.com",
      employeeId: "67890",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("email")).toBe("admin@example.com");
    expect(url.searchParams.get("employee_id")).toBe("67890");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 401 });
    await expect(executeUsersListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
