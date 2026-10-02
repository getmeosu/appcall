import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeOffersListSync,
  executePipelineStagesListSync,
} from "../src/sync";
import candidatesFixture from "../fixtures/candidates_list.json";
import offersFixture from "../fixtures/offers_list.json";
import templatesListFixture from "../fixtures/pipeline_templates_list.json";
import templateDetailFixture from "../fixtures/pipeline_template_detail.json";
import offerDetailFixture from "../fixtures/offer_detail_stages.json";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function stubFetchRouter(
  routes: Array<{ match: (url: URL) => boolean; body: string; status?: number }>,
) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    const req = new Request(input as string, requestInit);
    calls.push(req);
    const url = new URL(req.url);
    const route = routes.find((r) => r.match(url));
    if (!route) {
      return new Response(JSON.stringify({ error: `unexpected ${url.pathname}` }), { status: 500 });
    }
    return new Response(route.body, { status: route.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { company: "acme", accessToken: "tok_secret_value" };

describe("Recruitee jobs.list sync", () => {
  test("requests the careers endpoint on the tenant host", async () => {
    const { calls, impl } = stubFetch('{"offers":[{"id":1,"title":"Engineer"}]}');

    await executeJobsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("acme.recruitee.com");
    expect(url.pathname).toBe("/api/offers");
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
      executeJobsListSync({ ...auth, company: "evil.example.net/", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Recruitee candidates.list sync", () => {
  test("GETs ATS /candidates on api.recruitee.com", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.recruitee.com");
    expect(url.pathname).toBe("/c/acme/candidates");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("rc-candidate:28057517");
  });

  test("forwards limit/offset/offerId/query", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      limit: 10,
      offset: 20,
      offerId: "945",
      query: "jane",
      fetch: impl,
    });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("offer_id")).toBe("945");
    expect(url.searchParams.get("query")).toBe("jane");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Recruitee offers.list sync", () => {
  test("GETs ATS /offers (not careers host)", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offersFixture));

    const result = await executeOffersListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.recruitee.com");
    expect(url.pathname).toBe("/c/acme/offers");
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0].id).toBe("rc-offer:945");
    expect(result.total).toBe(2);
  });

  test("forwards scope and view_mode", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offersFixture));

    await executeOffersListSync({ ...auth, scope: "active", viewMode: "brief", fetch: impl });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("scope")).toBe("active");
    expect(url.searchParams.get("view_mode")).toBe("brief");
  });
});

describe("Recruitee pipeline_stages.list sync", () => {
  test("reads stages from offer detail when offerId is set", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offerDetailFixture));

    const result = await executePipelineStagesListSync({
      ...auth,
      offerId: "945",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/c/acme/offers/945");
    expect(result.stages).toHaveLength(2);
    expect(result.stages[0].id).toBe("rc-stage:19794");
    expect(result.stages[0].offerId).toBe("945");
    expect(result.total).toBe(2);
  });

  test("reads stages from a pipeline template when pipelineTemplateId is set", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(templateDetailFixture));

    const result = await executePipelineStagesListSync({
      ...auth,
      pipelineTemplateId: "2438",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/c/acme/pipeline_templates/2438");
    expect(result.stages).toHaveLength(3);
    expect(result.stages[2].name).toBe("Hired");
  });

  test("lists templates then fetches details when no filter is set", async () => {
    const { calls, impl } = stubFetchRouter([
      {
        match: (u) => u.pathname === "/c/acme/pipeline_templates",
        body: JSON.stringify(templatesListFixture),
      },
      {
        match: (u) => u.pathname === "/c/acme/pipeline_templates/2438",
        body: JSON.stringify(templateDetailFixture),
      },
      {
        match: (u) => u.pathname === "/c/acme/pipeline_templates/2500",
        body: JSON.stringify({
          pipeline_template: {
            id: 2500,
            title: "Sales Pipeline",
            stages: [
              { id: 30001, name: "Applied", category: "apply", group: "applicants", position: -1 },
              { id: 19794, name: "Applied", category: "apply", group: "applicants", position: -1 },
            ],
          },
        }),
      },
    ]);

    const result = await executePipelineStagesListSync({ ...auth, fetch: impl });

    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/c/acme/pipeline_templates",
      "/c/acme/pipeline_templates/2438",
      "/c/acme/pipeline_templates/2500",
    ]);
    expect(result.stages).toHaveLength(4);
    expect(result.total).toBe(4);
  });
});
