import { describe, expect, test } from "bun:test";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeApplicationsListSync,
  executeCandidatesGetSync,
  executeApplicationsGetSync,
  executeCandidatesSearchSync,
  executeInterviewsListSync,
  executeApplicationsMoveSync,
  executeApplicationsRejectSync,
  executeApplicationsHireSync,
  executeInterviewsScheduleSync,
  executeInterviewsCancelSync,
} from "../src/sync";
import candidatesFixture from "../fixtures/candidates_list.json";
import applicationsFixture from "../fixtures/applications_list.json";
import candidateInfoFixture from "../fixtures/candidate_info.json";
import applicationInfoFixture from "../fixtures/application_info.json";
import applicationChangeStageFixture from "../fixtures/application_change_stage.json";
import candidatesSearchFixture from "../fixtures/candidates_search.json";
import interviewsFixture from "../fixtures/interviews_list.json";
import interviewScheduleCreateFixture from "../fixtures/interview_schedule_create.json";
import interviewScheduleCancelFixture from "../fixtures/interview_schedule_cancel.json";

// Every request is served by an injected fetch. No real network.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
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
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(next.body, {
      status: next.status ?? 200,
      headers: next.headers,
    });
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

describe("Ashby applications.get sync", () => {
  test("POSTs /application.info with applicationId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationInfoFixture));

    const result = await executeApplicationsGetSync({
      ...auth,
      applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.ashbyhq.com");
    expect(url.pathname).toBe("/application.info");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("fixturekey:", "utf8").toString("base64")}`,
    );
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e" });
    expect(result.application!.id).toBe("ash-application:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.application!.candidateName).toBe("Michael Bluth");
  });

  test("accepts submittedFormInstanceId instead of applicationId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationInfoFixture));

    await executeApplicationsGetSync({
      ...auth,
      submittedFormInstanceId: "form-inst-1",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ submittedFormInstanceId: "form-inst-1" });
  });

  test("prefers applicationId when both identifiers provided", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(applicationInfoFixture));

    await executeApplicationsGetSync({
      ...auth,
      applicationId: "app-1",
      submittedFormInstanceId: "form-1",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ applicationId: "app-1" });
  });

  test("requires applicationId or submittedFormInstanceId", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeApplicationsGetSync({ ...auth, fetch: impl })).rejects.toThrow(
      /applicationId or submittedFormInstanceId/,
    );
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 404 });
    await expect(
      executeApplicationsGetSync({ ...auth, applicationId: "missing", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Ashby candidates.search sync", () => {
  test("POSTs /candidate.search with email", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesSearchFixture));

    const result = await executeCandidatesSearchSync({
      ...auth,
      email: "adam.hart@example.com",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/candidate.search");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ email: "adam.hart@example.com" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].name).toBe("Adam Hart");
    expect(result.moreDataAvailable).toBe(false);
  });

  test("forwards email and name (AND) in JSON body", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidatesSearchFixture));

    await executeCandidatesSearchSync({
      ...auth,
      email: "adam.hart@example.com",
      name: "Adam Hart",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({ email: "adam.hart@example.com", name: "Adam Hart" });
  });

  test("requires email or name", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCandidatesSearchSync({ ...auth, fetch: impl })).rejects.toThrow(
      /email or name/,
    );
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 500 });
    await expect(
      executeCandidatesSearchSync({ ...auth, name: "Ada", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Ashby interviews.list sync", () => {
  test("POSTs /interview.list with Basic auth", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));

    const result = await executeInterviewsListSync({ ...auth, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.ashbyhq.com");
    expect(url.pathname).toBe("/interview.list");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("authorization")).toBe(
      `Basic ${Buffer.from("fixturekey:", "utf8").toString("base64")}`,
    );
    expect(result.interviews).toHaveLength(2);
    expect(result.interviews[0].id).toBe("ash-interview:e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(result.moreDataAvailable).toBe(true);
    expect(result.nextCursor).toBe("cursor-int-2");
    expect(result.syncToken).toBe("sync-interviews-1");
  });

  test("forwards limit/cursor/syncToken in JSON body", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewsFixture));

    await executeInterviewsListSync({
      ...auth,
      limit: 50,
      cursor: "cur_i",
      syncToken: "tok_i",
      fetch: impl,
    });

    const body = JSON.parse(await calls[0].text());
    expect(body).toEqual({
      limit: 50,
      cursor: "cur_i",
      syncToken: "tok_i",
    });
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeInterviewsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects missing apiKey before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeInterviewsListSync({ apiKey: "", fetch: impl })).rejects.toThrow(/apiKey/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby applications.move (write; runner owns Reconcile)", () => {
  test("POSTs /application.changeStage without in-handler GET", async () => {
    const { calls, impl } = stubSequence([
      { body: JSON.stringify(applicationChangeStageFixture) },
    ]);

    const result = await executeApplicationsMoveSync({
      ...auth,
      applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      interviewStageId: "a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/application.changeStage");
    expect(calls[0].method).toBe("POST");
    const posted = JSON.parse(await calls[0].clone().text());
    expect(posted).toEqual({
      applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      interviewStageId: "a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5",
    });
    expect(result.application).toBeNull();
  });

  test("rejects missing interviewStageId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeApplicationsMoveSync({
        ...auth,
        applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
        interviewStageId: "",
        fetch: impl,
      }),
    ).rejects.toThrow(/interviewStageId/);
    expect(calls).toHaveLength(0);
  });

  test("classifies upstream errors on changeStage", async () => {
    const { impl } = stubFetch("{}", { status: 422 });
    await expect(
      executeApplicationsMoveSync({
        ...auth,
        applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
        interviewStageId: "a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5",
        fetch: impl,
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("Ashby applications.reject (write; runner owns Reconcile)", () => {
  test("POSTs changeStage with archiveReasonId without in-handler GET", async () => {
    const { calls, impl } = stubSequence([
      { body: JSON.stringify(applicationChangeStageFixture) },
    ]);

    const result = await executeApplicationsRejectSync({
      ...auth,
      applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      interviewStageId: "cccccccc-dddd-4eee-8fff-000000000001",
      archiveReasonId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    const posted = JSON.parse(await calls[0].clone().text());
    expect(posted).toEqual({
      applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      interviewStageId: "cccccccc-dddd-4eee-8fff-000000000001",
      archiveReasonId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    });
    expect(result.application).toBeNull();
  });

  test("requires archiveReasonId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeApplicationsRejectSync({
        ...auth,
        applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
        interviewStageId: "cccccccc-dddd-4eee-8fff-000000000001",
        archiveReasonId: "",
        fetch: impl,
      }),
    ).rejects.toThrow(/archiveReasonId/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby applications.hire (write; runner owns Reconcile)", () => {
  test("POSTs changeStage without in-handler GET", async () => {
    const { calls, impl } = stubSequence([
      { body: JSON.stringify(applicationChangeStageFixture) },
    ]);

    const result = await executeApplicationsHireSync({
      ...auth,
      applicationId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      interviewStageId: "dddddddd-eeee-4fff-8000-111111111111",
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/application.changeStage");
    expect(result.application).toBeNull();
  });
});

describe("Ashby interviews.schedule", () => {
  test("POSTs /interviewSchedule.create and normalizes schedule", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewScheduleCreateFixture));

    const result = await executeInterviewsScheduleSync({
      ...auth,
      applicationId: "7211e226-7802-41fd-8d55-2720fe9d534f",
      interviewEvents: [
        {
          startTime: "2024-05-01T15:00:00.000Z",
          endTime: "2024-05-01T16:00:00.000Z",
          interviewers: [{ email: "test@ashbyhq.com", feedbackRequired: true }],
          interviewId: "46648e83-f28f-43c4-a2a0-58e0599cff41",
        },
      ],
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/interviewSchedule.create");
    const posted = JSON.parse(await calls[0].clone().text());
    expect(posted.applicationId).toBe("7211e226-7802-41fd-8d55-2720fe9d534f");
    expect(posted.interviewEvents).toHaveLength(1);
    expect(posted.interviewEvents[0].interviewers[0].email).toBe("test@ashbyhq.com");

    expect(result.interviewSchedule?.id).toBe(
      "ash-interview-schedule:e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
    );
    expect(result.interviewSchedule?.status).toBe("Scheduled");
    expect(result.interviewSchedule?.events).toHaveLength(1);
    expect(result.interviewSchedule?.events[0].interviewerEmails).toEqual(["test@ashbyhq.com"]);
  });

  test("rejects empty interviewEvents before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeInterviewsScheduleSync({
        ...auth,
        applicationId: "7211e226-7802-41fd-8d55-2720fe9d534f",
        interviewEvents: [],
        fetch: impl,
      }),
    ).rejects.toThrow(/interviewEvents/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby interviews.cancel", () => {
  test("POSTs /interviewSchedule.cancel with id mapped from interviewScheduleId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(interviewScheduleCancelFixture));

    const result = await executeInterviewsCancelSync({
      ...auth,
      interviewScheduleId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      allowReschedule: false,
      fetch: impl,
    });

    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/interviewSchedule.cancel");
    const posted = JSON.parse(await calls[0].clone().text());
    expect(posted).toEqual({
      id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      allowReschedule: false,
    });
    expect(result.interviewSchedule?.status).toBe("Cancelled");
  });

  test("rejects missing interviewScheduleId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeInterviewsCancelSync({
        ...auth,
        interviewScheduleId: "",
        fetch: impl,
      }),
    ).rejects.toThrow(/interviewScheduleId/);
    expect(calls).toHaveLength(0);
  });
});
