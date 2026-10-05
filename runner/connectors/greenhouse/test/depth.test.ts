import { describe, expect, test, beforeEach } from "bun:test";
import {
  executeCandidatesCreateSync,
  executeCandidatesUpdateSync,
  executeOffersListSync,
  executeOffersGetSync,
  executeScorecardsListSync,
  executeScorecardsGetSync,
  executeDepartmentsListSync,
  executeOfficesListSync,
  executeSourcesListSync,
  executeCloseReasonsListSync,
  executeUsersGetSync,
  executeApplicationsRejectSync,
} from "../src/sync";
import { clearGreenhouseTokenCache } from "../src/http";
import candidateCreatedFixture from "../fixtures/candidate_created.json";
import offersFixture from "../fixtures/offers_list.json";
import offerGetFixture from "../fixtures/offer_get.json";
import scorecardsFixture from "../fixtures/scorecards_list.json";
import scorecardGetFixture from "../fixtures/scorecard_get.json";
import departmentsFixture from "../fixtures/departments_list.json";
import officesFixture from "../fixtures/offices_list.json";
import sourcesFixture from "../fixtures/sources_list.json";
import closeReasonsFixture from "../fixtures/close_reasons_list.json";
import userGetFixture from "../fixtures/user_get.json";


const TEST_ACCESS_TOKEN = "test-access-token";
const TOKEN_JSON = JSON.stringify({
  access_token: TEST_ACCESS_TOKEN,
  token_type: "Bearer",
  expires_in: 3600,
});

function isTokenUrl(input: string | URL | Request): boolean {
  return String(input).includes("auth.greenhouse.io/token");
}

// Every request is served by an injected fetch. No real network.
// Authenticated Harvest calls mint a Bearer token first.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    if (isTokenUrl(input)) {
      return new Response(TOKEN_JSON, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function stubSequence(
  responses: Array<{ body: string; status?: number; headers?: Record<string, string> }>,
) {
  const calls: Request[] = [];
  let i = 0;
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    if (isTokenUrl(input)) {
      return new Response(TOKEN_JSON, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return new Response(next.body, {
      status: next.status ?? 200,
      headers: next.headers,
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function harvestCalls(calls: Request[]): Request[] {
  return calls.filter((c) => c.url.includes("harvest.greenhouse.io"));
}

const auth = { clientId: "fixture-client", clientSecret: "fixture-secret" };

beforeEach(() => {
  clearGreenhouseTokenCache();
});

describe("Greenhouse candidates.create (POST only; creates omit effect keys)", () => {
  test("POSTs /v3/candidates and returns primary payload", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateCreatedFixture), { status: 201 });
    const result = await executeCandidatesCreateSync({
      ...auth,
      firstName: "John",
      lastName: "Locke",
      email: "test@example.com",
      jobId: 107761,
      fetch: impl,
    });
    expect(harvestCalls(calls).length).toBe(1);
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/candidates");
    expect(harvestCalls(calls)[0]!.method).toBe("POST");
    expect(JSON.parse(await harvestCalls(calls)[0]!.clone().text())).toEqual({
      first_name: "John",
      last_name: "Locke",
      email_addresses: [{ value: "test@example.com", type: "personal" }],
      applications: [{ job_id: 107761 }],
    });
    expect(result.id).toBe(57683957);
  });

  test("rejects missing firstName before fetch", async () => {
    const { calls, impl } = stubFetch("");
    await expect(
      executeCandidatesCreateSync({ ...auth, firstName: "", lastName: "Locke", fetch: impl }),
    ).rejects.toThrow(/firstName/);
    expect(calls).toHaveLength(0);
  });
});

describe("Greenhouse candidates.update (PATCH; runner owns Reconcile)", () => {
  test("PATCHes /v3/candidates/{id} without in-handler GET", async () => {
    const { calls, impl } = stubFetch("{}", { status: 200 });
    const result = await executeCandidatesUpdateSync({
      ...auth,
      id: "57683957",
      company: "Acme",
      title: "Engineer",
      fetch: impl,
    });
    expect(harvestCalls(calls).length).toBe(1);
    expect(harvestCalls(calls)[0]!.method).toBe("PATCH");
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/candidates/57683957");
    expect(JSON.parse(await harvestCalls(calls)[0]!.clone().text())).toEqual({ company: "Acme", title: "Engineer" });
    expect(result.candidate).toBeNull();
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCandidatesUpdateSync({ ...auth, id: "../evil", company: "x", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Greenhouse offers.list / get", () => {
  test("GETs /v3/offers", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offersFixture));
    const result = await executeOffersListSync({ ...auth, jobId: 149995, fetch: impl });
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/offers");
    expect(new URL(harvestCalls(calls)[0]!.url).searchParams.get("job_ids")).toBe("149995");
    expect(result.offers[0].id).toBe("gh-offer:400544");
    expect(result.offers[0].status).toBe("unresolved");
  });

  test("GETs /v3/offers?ids=", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offerGetFixture));
    const result = await executeOffersGetSync({ ...auth, id: "400544", fetch: impl });
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/offers");
    expect(new URL(harvestCalls(calls)[0]!.url).searchParams.get("ids")).toBe("400544");
    expect(result.offer?.applicationId).toBe("69306314");
  });
});

describe("Greenhouse scorecards.list / get", () => {
  test("GETs /v3/scorecards", async () => {
    const { impl } = stubFetch(JSON.stringify(scorecardsFixture));
    const result = await executeScorecardsListSync({ ...auth, fetch: impl });
    expect(result.scorecards).toHaveLength(2);
    expect(result.scorecards[0].id).toBe("gh-scorecard:88112");
    expect(result.scorecards[0].overallRecommendation).toBe("yes");
    expect(result.scorecards[1].status).toBe("draft");
  });

  test("GETs /v3/scorecards?ids=", async () => {
    const { impl } = stubFetch(JSON.stringify(scorecardGetFixture));
    const result = await executeScorecardsGetSync({ ...auth, id: "88112", fetch: impl });
    expect(result.scorecard?.applicationId).toBe("69306314");
  });
});

describe("Greenhouse departments / offices / sources / close_reasons", () => {
  test("GETs /v3/departments", async () => {
    const { impl } = stubFetch(JSON.stringify(departmentsFixture));
    const result = await executeDepartmentsListSync({ ...auth, fetch: impl });
    expect(result.departments[0].id).toBe("gh-department:453616");
    expect(result.departments[1].parentId).toBe("453616");
  });

  test("GETs /v3/offices", async () => {
    const { impl } = stubFetch(JSON.stringify(officesFixture));
    const result = await executeOfficesListSync({ ...auth, fetch: impl });
    expect(result.offices[0].id).toBe("gh-office:47013");
    expect(result.offices[0].location).toBe("New York, NY");
  });

  test("GETs /v3/sources", async () => {
    const { impl } = stubFetch(JSON.stringify(sourcesFixture));
    const result = await executeSourcesListSync({ ...auth, fetch: impl });
    expect(result.sources[0].id).toBe("gh-source:16");
    expect(result.sources[0].name).toBe("LinkedIn (Prospecting)");
  });

  test("GETs /v3/close_reasons", async () => {
    const { impl } = stubFetch(JSON.stringify(closeReasonsFixture));
    const result = await executeCloseReasonsListSync({ ...auth, fetch: impl });
    expect(result.closeReasons[0].id).toBe("gh-close-reason:700");
  });
});

describe("Greenhouse users.get", () => {
  test("GETs /v3/users?ids=", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(userGetFixture));
    const result = await executeUsersGetSync({ ...auth, id: "1049756", fetch: impl });
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/users");
    expect(new URL(harvestCalls(calls)[0]!.url).searchParams.get("ids")).toBe("1049756");
    expect(result.user?.id).toBe("gh-user:1049756");
    expect(result.user?.primaryEmail).toBe("integrationuser@example.com");
  });
});

describe("Greenhouse applications.reject (write; runner owns Reconcile)", () => {
  test("POSTs /v3/applications?ids=/reject without in-handler GET", async () => {
    const { calls, impl } = stubFetch("", { status: 204 });
    const result = await executeApplicationsRejectSync({
      ...auth,
      id: "69306314",
      rejectionReasonId: 700,
      notes: "Not a fit",
      fetch: impl,
    });
    expect(harvestCalls(calls).length).toBe(1);
    expect(harvestCalls(calls)[0]!.method).toBe("POST");
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/applications/69306314/reject");
    expect(JSON.parse(await harvestCalls(calls)[0]!.clone().text())).toEqual({
      rejection_reason_id: 700,
      notes: "Not a fit",
    });
    expect(result.application).toBeNull();
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 422 });
    await expect(
      executeApplicationsRejectSync({ ...auth, id: "69306314", rejectionReasonId: 700, fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
