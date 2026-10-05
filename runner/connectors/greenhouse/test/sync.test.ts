import { describe, expect, test, beforeEach } from "bun:test";
import {
  executeJobsListSync,
  executeJobsGetSync,
  executeCandidatesListSync,
  executeCandidatesGetSync,
  executeApplicationsListSync,
  executeApplicationsGetSync,
  executeApplicationsMoveSync,
  executeApplicationsCreateSync,
  executeUsersListSync,
  executeInterviewsListSync,
  executeJobInterviewStagesListSync,
} from "../src/sync";
import { clearGreenhouseTokenCache } from "../src/http";
import candidatesFixture from "../fixtures/candidates_list.json";
import candidateGetFixture from "../fixtures/candidate_get.json";
import applicationsFixture from "../fixtures/applications_list.json";
import applicationGetFixture from "../fixtures/application_get.json";
import applicationCreatedFixture from "../fixtures/application_created.json";
import usersFixture from "../fixtures/users_list.json";
import jobGetFixture from "../fixtures/job_get.json";
import interviewsFixture from "../fixtures/interviews_list.json";
import stagesFixture from "../fixtures/job_interview_stages_list.json";


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
  test("GETs /v3/candidates with Bearer auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    const result = await executeCandidatesListSync({ ...auth, fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/candidates");
    expect(harvest[0]!.method).toBe("GET");
    expect(harvest[0]!.headers.get("authorization")).toBe(
      `Bearer test-access-token`,
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].id).toBe("gh-candidate:53883394");
    expect(result.candidates[0].name).toBe("John Locke");
  });

  test("forwards perPage/cursor/jobId/email filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesFixture));

    await executeCandidatesListSync({
      ...auth,
      perPage: 50,
      cursor: "cursor-page-2",
      jobId: 107761,
      email: "test@example.com",
      createdAfter: "2017-01-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("cursor")).toBe("cursor-page-2");
    expect(url.searchParams.get("job_ids")).toBe("107761");
    expect(url.searchParams.get("email")).toBe("test@example.com");
    expect(url.searchParams.get("created_at")).toBe("gte|2017-01-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeCandidatesListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects missing clientId before fetch", async () => {
    const { calls, impl } = stubFetch("[]");
    await expect(executeCandidatesListSync({ clientId: "", clientSecret: "x", fetch: impl })).rejects.toThrow(/clientId/);
    expect(calls).toHaveLength(0);
  });
});

describe("Greenhouse applications.list sync", () => {
  test("GETs /v3/applications with Bearer auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    const result = await executeApplicationsListSync({ ...auth, fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/applications");
    expect(harvestCalls(calls)[0]!.method).toBe("GET");
    expect(result.applications).toHaveLength(2);
    expect(result.applications[0].id).toBe("gh-application:69306314");
    expect(result.applications[0].status).toBe("active");
    expect(result.applications[1].prospect).toBe(true);
  });

  test("forwards perPage/cursor/jobId/status filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationsFixture));

    await executeApplicationsListSync({
      ...auth,
      perPage: 25,
      cursor: "cursor-1",
      jobId: 107761,
      status: "active",
      lastActivityAfter: "2017-09-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.searchParams.get("per_page")).toBe("25");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
    expect(url.searchParams.get("job_ids")).toBe("107761");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("last_activity_at")).toBe("gte|2017-09-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeApplicationsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Greenhouse applications.get sync", () => {
  test("GETs /v3/applications?ids= with Bearer auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationGetFixture));

    const result = await executeApplicationsGetSync({ ...auth, id: "69306314", fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/applications");
    expect(url.searchParams.get("ids")).toBe("69306314");
    expect(harvestCalls(calls)[0]!.method).toBe("GET");
    expect(result.application?.id).toBe("gh-application:69306314");
    expect(result.application?.stageName).toBe("Application Review");
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeApplicationsGetSync({ ...auth, id: "../evil", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Greenhouse applications.move (write; runner owns Reconcile)", () => {
  test("POSTs /v3/applications/{id}/move without in-handler GET", async () => {
    const { calls, impl } = stubSequence([
      { body: "", status: 204 },
    ]);

    const result = await executeApplicationsMoveSync({
      ...auth,
      id: "69306314",
      fromStageId: 767358,
      toStageId: 767359,
      fetch: impl,
    });

    expect(harvestCalls(calls).length).toBe(1);
    const moveUrl = new URL(harvestCalls(calls)[0]!.url);
    expect(moveUrl.pathname).toBe("/v3/applications/69306314/move");
    expect(harvestCalls(calls)[0]!.method).toBe("POST");
    expect(harvestCalls(calls)[0]!.headers.get("content-type")).toBe("application/json");
    const posted = JSON.parse(await harvestCalls(calls)[0]!.clone().text());
    expect(posted).toEqual({ from_stage_id: 767358, to_stage_id: 767359 });
    expect(result.application).toBeNull();
  });

  test("forwards toJobId / emailFromUserId on move body", async () => {
    const { calls, impl } = stubSequence([
      { body: "", status: 204 },
    ]);

    await executeApplicationsMoveSync({
      ...auth,
      id: "69306314",
      fromStageId: "767358",
      toJobId: 224587,
      emailFromUserId: 92120,
      fetch: impl,
    });

    const posted = JSON.parse(await harvestCalls(calls)[0]!.clone().text());
    expect(posted).toEqual({
      from_stage_id: 767358,
      to_job_id: 224587,
      email_from_user_id: 92120,
    });
  });

  test("rejects missing fromStageId before fetch", async () => {
    const { calls, impl } = stubFetch("");
    await expect(
      executeApplicationsMoveSync({
        ...auth,
        id: "69306314",
        fromStageId: "" as unknown as string,
        fetch: impl,
      }),
    ).rejects.toThrow(/fromStageId/);
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors on move", async () => {
    const { impl } = stubFetch("{}", { status: 422 });
    await expect(
      executeApplicationsMoveSync({
        ...auth,
        id: "69306314",
        fromStageId: 767358,
        toStageId: 767359,
        fetch: impl,
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Greenhouse applications.create (POST only; creates omit effect keys)", () => {
  test("POSTs /v3/applications and returns primary payload (no in-handler GET)", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationCreatedFixture), { status: 201 });

    const result = await executeApplicationsCreateSync({
      ...auth,
      candidateId: 57683957,
      jobId: 107761,
      fetch: impl,
    });

    expect(harvestCalls(calls).length).toBe(1);
    const createUrl = new URL(harvestCalls(calls)[0]!.url);
    expect(createUrl.pathname).toBe("/v3/applications");
    expect(harvestCalls(calls)[0]!.method).toBe("POST");
    expect(harvestCalls(calls)[0]!.headers.get("content-type")).toBe("application/json");
    const posted = JSON.parse(await harvestCalls(calls)[0]!.clone().text());
    expect(posted).toEqual({ candidate_id: 57683957, job_id: 107761 });

    expect(result.id).toBe(69306314);
    expect(result.candidate_id).toBe(57683957);
    expect(result.job_id).toBe(107761);
  });

  test("forwards optional stage/source/recruiter/coordinator/referrer ids", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationCreatedFixture), { status: 201 });

    await executeApplicationsCreateSync({
      ...auth,
      candidateId: "57683957",
      jobId: "107761",
      initialStageId: 767358,
      sourceId: 2,
      recruiterId: 92120,
      coordinatorId: 453636,
      referrerId: 99,
      fetch: impl,
    });

    expect(harvestCalls(calls).length).toBe(1);
    const posted = JSON.parse(await harvestCalls(calls)[0]!.clone().text());
    expect(posted).toEqual({
      candidate_id: 57683957,
      job_id: 107761,
      initial_stage_id: 767358,
      source_id: 2,
      recruiter_id: 92120,
      coordinator_id: 453636,
      referrer_id: 99,
    });
  });

  test("rejects missing candidateId before fetch", async () => {
    const { calls, impl } = stubFetch("");
    await expect(
      executeApplicationsCreateSync({
        ...auth,
        candidateId: "" as unknown as string,
        jobId: 107761,
        fetch: impl,
      }),
    ).rejects.toThrow(/candidateId/);
    expect(calls).toHaveLength(0);
  });

  test("rejects missing jobId before fetch", async () => {
    const { calls, impl } = stubFetch("");
    await expect(
      executeApplicationsCreateSync({
        ...auth,
        candidateId: 57683957,
        jobId: "" as unknown as string,
        fetch: impl,
      }),
    ).rejects.toThrow(/jobId/);
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors on create", async () => {
    const { impl } = stubFetch("{}", { status: 422 });
    await expect(
      executeApplicationsCreateSync({
        ...auth,
        candidateId: 57683957,
        jobId: 107761,
        fetch: impl,
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Greenhouse users.list sync", () => {
  test("GETs /v3/users with Bearer auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    const result = await executeUsersListSync({ ...auth, fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/users");
    expect(harvestCalls(calls)[0]!.method).toBe("GET");
    expect(result.users).toHaveLength(2);
    expect(result.users[0].id).toBe("gh-user:1049756");
    expect(result.users[0].primaryEmail).toBe("integrationuser@example.com");
    expect(result.users[0].siteAdmin).toBe(true);
  });

  test("forwards perPage/cursor/email/employeeId filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));

    await executeUsersListSync({
      ...auth,
      perPage: 10,
      cursor: "cursor-3",
      email: "admin@example.com",
      employeeId: "67890",
      fetch: impl,
    });

    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(url.searchParams.get("cursor")).toBe("cursor-3");
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

describe("Greenhouse candidates.get sync", () => {
  test("GETs /v3/candidates?ids= with Bearer auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateGetFixture));

    const result = await executeCandidatesGetSync({ ...auth, id: "53883394", fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/candidates");
    expect(url.searchParams.get("ids")).toBe("53883394");
    expect(harvest[0]!.method).toBe("GET");
    expect(harvest[0]!.headers.get("authorization")).toBe(
      `Bearer test-access-token`,
    );
    expect(result.candidate?.id).toBe("gh-candidate:53883394");
    expect(result.candidate?.name).toBe("John Locke");
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeCandidatesGetSync({ ...auth, id: "../evil", fetch: impl }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 404 });
    await expect(
      executeCandidatesGetSync({ ...auth, id: "53883394", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Greenhouse jobs.get sync", () => {
  test("GETs Harvest /v3/jobs?ids= (not boards)", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobGetFixture));

    const result = await executeJobsGetSync({ ...auth, id: "224588", fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/jobs");
    expect(url.searchParams.get("ids")).toBe("224588");
    expect(harvestCalls(calls)[0]!.method).toBe("GET");
    expect(result.job?.id).toBe("gh-job:224588");
    expect(result.job?.title).toBe("Product Manager");
    expect(result.job?.department).toBe("Product");
  });

  test("rejects unsafe id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeJobsGetSync({ ...auth, id: "a/b", fetch: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(executeJobsGetSync({ ...auth, id: "224588", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Greenhouse interviews.list sync", () => {
  test("GETs /v3/interviews with Bearer auth on harvest host", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));

    const result = await executeInterviewsListSync({ ...auth, fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/interviews");
    expect(harvestCalls(calls)[0]!.method).toBe("GET");
    expect(result.interviews).toHaveLength(2);
    expect(result.interviews[0].id).toBe("gh-interview:997234");
    expect(result.interviews[0].interviewName).toBe("Recruiter Phone Screen");
  });

  test("forwards perPage/cursor/applicationId/jobId filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));

    await executeInterviewsListSync({
      ...auth,
      perPage: 25,
      cursor: "cursor-page-2",
      applicationId: 69306314,
      jobId: 107761,
      createdAfter: "2017-01-01T00:00:00.000Z",
      fetch: impl,
    });

    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.searchParams.get("per_page")).toBe("25");
    expect(url.searchParams.get("cursor")).toBe("cursor-page-2");
    expect(url.searchParams.get("application_ids")).toBe("69306314");
    expect(url.searchParams.get("job_ids")).toBe("107761");
    expect(url.searchParams.get("created_at")).toBe("gte|2017-01-01T00:00:00.000Z");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeInterviewsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

describe("Greenhouse job_interview_stages.list sync", () => {
  test("GETs /v3/job_interview_stages with Bearer auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(stagesFixture));

    const result = await executeJobInterviewStagesListSync({ ...auth, fetch: impl });

    const harvest = harvestCalls(calls);
    expect(harvest.length).toBeGreaterThanOrEqual(1);
    const url = new URL(harvest[0]!.url);
    expect(url.hostname).toBe("harvest.greenhouse.io");
    expect(url.pathname).toBe("/v3/job_interview_stages");
    expect(harvestCalls(calls)[0]!.method).toBe("GET");
    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].id).toBe("gh-job-interview-stage:767358");
    expect(result.stages[0].name).toBe("Application Review");
    expect(result.stages[0].jobId).toBe("107761");
    expect(result.stages[0].sortOrder).toBe(0);
    expect(result.stages[0].active).toBe(true);
  });

  test("forwards jobIds/active/perPage filters", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(stagesFixture));

    await executeJobInterviewStagesListSync({
      ...auth,
      jobIds: "107761,224588",
      active: true,
      perPage: 50,
      fetch: impl,
    });

    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.searchParams.get("job_ids")).toBe("107761,224588");
    expect(url.searchParams.get("active")).toBe("true");
    expect(url.searchParams.get("per_page")).toBe("50");
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(
      executeJobInterviewStagesListSync({ ...auth, fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
