import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeOpportunitiesListSync,
  executeStagesListSync,
  executeUsersListSync,
} from "../src/sync";
import opportunitiesFixture from "../fixtures/opportunities_list.json";
import stagesFixture from "../fixtures/stages_list.json";
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

const auth = { apiKey: "fixturekey", region: "co" };

describe("Lever jobs.list sync", () => {
  test("requests the documented endpoint on the allowed host", async () => {
    const { calls, impl } = stubFetch('[{"id":"j1","text":"Engineer","hostedUrl":"https://acme.example/j1"}]');

    await executeJobsListSync({ ...{ site: "acme" }, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.lever.co");
    expect(url.pathname).toBe("/v0/postings/acme");
    expect(calls[0].method).toBe("GET");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch(`{"error":"nope"}`, { status: 500 });

    await expect(executeJobsListSync({ ...{ site: "acme" }, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "30" } });

    await expect(executeJobsListSync({ ...{ site: "acme" }, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 30,
    });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ ...{ site: "acme" }, fetch: impl })).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });

  test("rejects a tenant value that would steer the request off-host", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(
      executeJobsListSync({
        ...{ site: "acme" },
        site: "evil.example.net/",
        fetch: impl,
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Lever opportunities.list sync", () => {
  test("GETs /v1/opportunities with Basic auth on the region host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(opportunitiesFixture));

    const result = await executeOpportunitiesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.lever.co");
    expect(url.pathname).toBe("/v1/opportunities");
    expect(calls[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("fixturekey:", "utf8").toString("base64")}`,
    );
    expect(result.opportunities).toHaveLength(2);
    expect(result.opportunities[0].id).toBe(
      "lev-opportunity:3410c8b9-5c31-4bab-b7e9-9f710206d647",
    );
    expect(result.hasNext).toBe(true);
  });

  test("uses api.lever.eu when region is eu", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(opportunitiesFixture));

    await executeOpportunitiesListSync({ ...auth, region: "eu", fetch: impl });

    expect(new URL(calls[0].url).hostname).toBe("api.lever.eu");
  });

  test("forwards limit/offset/email/tag/stageId/postingId/archived", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(opportunitiesFixture));

    await executeOpportunitiesListSync({
      ...auth,
      limit: 25,
      offset: "tok_next",
      email: "a@b.com",
      tag: "engineer",
      stageId: "lead-new",
      postingId: "post-1",
      archived: "false",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("offset")).toBe("tok_next");
    expect(url.searchParams.get("email")).toBe("a@b.com");
    expect(url.searchParams.get("tag")).toBe("engineer");
    expect(url.searchParams.get("stage_id")).toBe("lead-new");
    expect(url.searchParams.get("posting_id")).toBe("post-1");
    expect(url.searchParams.get("archived")).toBe("false");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeOpportunitiesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects an invalid region before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeOpportunitiesListSync({ ...auth, region: "us", fetch: impl }),
    ).rejects.toThrow(/region/);
    expect(calls).toHaveLength(0);
  });
});

describe("Lever stages.list sync", () => {
  test("GETs /v1/stages with Basic auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(stagesFixture));

    const result = await executeStagesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.lever.co");
    expect(url.pathname).toBe("/v1/stages");
    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].id).toBe("lev-stage:lead-new");
  });

  test("forwards limit/offset", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(stagesFixture));

    await executeStagesListSync({ ...auth, limit: 10, offset: "abc", fetch: impl });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("abc");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeStagesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Lever users.list sync", () => {
  test("GETs /v1/users with Basic auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    const result = await executeUsersListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.lever.co");
    expect(url.pathname).toBe("/v1/users");
    expect(result.users).toHaveLength(2);
    expect(result.users[0].id).toBe("lev-user:8d49b010-cc6a-4f40-ace5-e86061c677ed");
  });

  test("forwards limit/offset/email/accessRole", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    await executeUsersListSync({
      ...auth,
      limit: 50,
      offset: "u_next",
      email: "nic@brickly.com",
      accessRole: "admin",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("u_next");
    expect(url.searchParams.get("email")).toBe("nic@brickly.com");
    expect(url.searchParams.get("access_role")).toBe("admin");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 401 });
    await expect(executeUsersListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
