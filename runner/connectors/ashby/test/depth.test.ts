import { describe, expect, test } from "bun:test";
import {
  executeJobsGetSync,
  executeCandidatesUpdateSync,
  executeOffersListSync,
  executeOffersGetSync,
  executeDepartmentsListSync,
  executeUsersListSync,
  executeSourcesListSync,
  executeArchiveReasonsListSync,
  executeInterviewSchedulesListSync,
  executeInterviewStagesListSync,
  executeOpeningsListSync,
} from "../src/sync";
import jobInfoFixture from "../fixtures/job_info.json";
import candidateUpdatedFixture from "../fixtures/candidate_updated.json";
import offersFixture from "../fixtures/offers_list.json";
import offerInfoFixture from "../fixtures/offer_info.json";
import departmentsFixture from "../fixtures/departments_list.json";
import usersFixture from "../fixtures/users_list.json";
import sourcesFixture from "../fixtures/sources_list.json";
import archiveReasonsFixture from "../fixtures/archive_reasons_list.json";
import schedulesFixture from "../fixtures/interview_schedules_list.json";
import stagesFixture from "../fixtures/interview_stages_list.json";
import openingsFixture from "../fixtures/openings_list.json";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { apiKey: "fixturekey" };

describe("Ashby jobs.get", () => {
  test("POSTs /job.info with id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(jobInfoFixture));
    const result = await executeJobsGetSync({ ...auth, id: "2cb69137-763a-4d6f-8f17-bbc3564ecb2e", fetch: impl });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/job.info");
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(await calls[0].text())).toEqual({ id: "2cb69137-763a-4d6f-8f17-bbc3564ecb2e" });
    expect(result.job?.id).toBe("ash-job:2cb69137-763a-4d6f-8f17-bbc3564ecb2e");
    expect(result.job?.title).toBe("Staff Engineer");
    expect(result.job?.department).toBe("Platform");
  });

  test("rejects missing id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeJobsGetSync({ ...auth, id: "", fetch: impl })).rejects.toThrow(/id/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby candidates.update (write; runner owns Reconcile)", () => {
  test("POSTs /candidate.update without in-handler GET", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateUpdatedFixture));
    const result = await executeCandidatesUpdateSync({
      ...auth,
      id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      phoneNumber: "+1-555-0199",
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/candidate.update");
    const posted = JSON.parse(await calls[0].text());
    expect(posted).toEqual({
      candidateId: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      phoneNumber: "+1-555-0199",
    });
    expect(posted.id).toBeUndefined();
    expect(result.candidate).toBeNull();
  });

  test("sends websiteUrl as Ashby websiteUrl", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(candidateUpdatedFixture));
    await executeCandidatesUpdateSync({
      ...auth,
      id: "e9ed20fd-d45f-4aad-8a00-a19bfba0083e",
      websiteUrl: "https://example.com",
      fetch: impl,
    });
    const posted = JSON.parse(await calls[0].text());
    expect(posted.websiteUrl).toBe("https://example.com");
    expect(posted.website).toBeUndefined();
    expect(posted.candidateId).toBe("e9ed20fd-d45f-4aad-8a00-a19bfba0083e");
    expect(posted.id).toBeUndefined();
  });

  test("rejects missing id before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(executeCandidatesUpdateSync({ ...auth, id: "", fetch: impl })).rejects.toThrow(/id/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby offers.list", () => {
  test("POSTs /offer.list and normalizes results", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offersFixture));
    const result = await executeOffersListSync({ ...auth, fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/offer.list");
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0].id).toBe("ash-offer:off-11111111-1111-4111-8111-111111111111");
    expect(result.offers[0].acceptanceStatus).toBe("Pending");
    expect(result.nextCursor).toBe("cursor-off-2");
  });

  test("forwards limit/cursor/syncToken/applicationId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offersFixture));
    await executeOffersListSync({
      ...auth,
      limit: 25,
      cursor: "cur",
      syncToken: "tok",
      applicationId: "app-1",
      fetch: impl,
    });
    expect(JSON.parse(await calls[0].text())).toEqual({
      limit: 25,
      cursor: "cur",
      syncToken: "tok",
      applicationId: "app-1",
    });
  });
});

describe("Ashby offers.get", () => {
  test("POSTs /offer.info with offerId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(offerInfoFixture));
    const result = await executeOffersGetSync({
      ...auth,
      offerId: "off-11111111-1111-4111-8111-111111111111",
      fetch: impl,
    });
    expect(new URL(calls[0].url).pathname).toBe("/offer.info");
    expect(JSON.parse(await calls[0].text())).toEqual({
      offerId: "off-11111111-1111-4111-8111-111111111111",
    });
    expect(result.offer?.applicationId).toBe("f9e52a51-a075-4116-a7b8-484deba69004");
  });
});

describe("Ashby departments.list", () => {
  test("POSTs /department.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(departmentsFixture));
    const result = await executeDepartmentsListSync({ ...auth, fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/department.list");
    expect(result.departments[0].id).toBe("ash-department:dept-1");
    expect(result.departments[0].name).toBe("Engineering");
    expect(result.departments[1].isArchived).toBe(true);
  });
});

describe("Ashby users.list", () => {
  test("POSTs /user.list", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(usersFixture));
    const result = await executeUsersListSync({ ...auth, fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/user.list");
    expect(result.users[0].id).toBe("ash-user:usr-1");
    expect(result.users[0].email).toBe("ada@example.com");
    expect(result.users[0].name).toBe("Ada Lovelace");
  });
});

describe("Ashby sources.list", () => {
  test("POSTs /source.list", async () => {
    const { impl } = stubFetch(JSON.stringify(sourcesFixture));
    const result = await executeSourcesListSync({ ...auth, fetch: impl });
    expect(result.sources[0].id).toBe("ash-source:src-1");
    expect(result.sources[0].title).toBe("LinkedIn");
  });
});

describe("Ashby archive_reasons.list", () => {
  test("POSTs /archiveReason.list", async () => {
    const { impl } = stubFetch(JSON.stringify(archiveReasonsFixture));
    const result = await executeArchiveReasonsListSync({ ...auth, fetch: impl });
    expect(result.archiveReasons[0].id).toBe("ash-archive-reason:ar-1");
    expect(result.archiveReasons[0].reasonType).toBe("RejectedByOrg");
  });
});

describe("Ashby interview_schedules.list", () => {
  test("POSTs /interviewSchedule.list", async () => {
    const { impl } = stubFetch(JSON.stringify(schedulesFixture));
    const result = await executeInterviewSchedulesListSync({ ...auth, fetch: impl });
    expect(result.interviewSchedules[0].id).toBe("ash-interview-schedule:sched-1");
    expect(result.interviewSchedules[0].events).toHaveLength(1);
  });

});

describe("Ashby interview_stages.list", () => {
  test("POSTs /interviewStage.list with exactly interviewPlanId", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(stagesFixture));
    const result = await executeInterviewStagesListSync({ ...auth, interviewPlanId: "plan-1", fetch: impl });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/interviewStage.list");
    expect(JSON.parse(await calls[0].text())).toEqual({ interviewPlanId: "plan-1" });
    expect(result.interviewStages[0].id).toBe("ash-interview-stage:stage-1");
    expect(result.interviewStages[0].title).toBe("Phone Screen");
  });

  test("rejects missing interviewPlanId before fetch", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeInterviewStagesListSync({ ...auth, interviewPlanId: "", fetch: impl }),
    ).rejects.toThrow(/interviewPlanId/);
    await expect(
      executeInterviewStagesListSync({ ...auth, fetch: impl } as unknown as Parameters<
        typeof executeInterviewStagesListSync
      >[0]),
    ).rejects.toThrow(/interviewPlanId/);
    expect(calls).toHaveLength(0);
  });
});

describe("Ashby openings.list", () => {
  test("POSTs /opening.list", async () => {
    const { impl } = stubFetch(JSON.stringify(openingsFixture));
    const result = await executeOpeningsListSync({ ...auth, fetch: impl });
    expect(result.openings[0].id).toBe("ash-opening:open-1");
    expect(result.openings[0].isOpen).toBe(true);
    expect(result.openings[1].isOpen).toBe(false);
  });

  test("classifies upstream errors", async () => {
    const { impl } = stubFetch("{}", { status: 503 });
    await expect(executeOpeningsListSync({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
