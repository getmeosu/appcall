import { describe, expect, test } from "bun:test";
import {
  executeApplicationsHire,
  executeApplicationsUpdate,
  executeApplicationStagesList,
  executeRejectionReasonsList,
  executeNotesCreate,
  executeNotesList,
  executeCandidatesApplyTag,
  executeCandidatesRemoveTag,
  executeInterviewsCreate,
  executeInterviewsUpdate,
  executeInterviewsDelete,
  executeOffersCreate,
  executeJobsListInternal,
  executeCandidateTagsList,
} from "../src/g1";
import { clearGreenhouseTokenCache } from "../src/http";
import applicationStages from "../fixtures/application_stages_list.json";
import rejectionReasons from "../fixtures/rejection_reasons_list.json";
import candidateTags from "../fixtures/candidate_tags_list.json";
import notesList from "../fixtures/notes_list.json";
import noteCreated from "../fixtures/note_created.json";
import appliedTag from "../fixtures/applied_candidate_tag_created.json";
import interviewCreated from "../fixtures/interview_created.json";
import offerCreated from "../fixtures/offer_created.json";
import jobsInternal from "../fixtures/jobs_list_internal.json";

const auth = { clientId: "fixture-client", clientSecret: "fixture-secret" };

function isToken(url: string) {
  return String(url).includes("auth.greenhouse.io/token");
}

function harvestCalls(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls.filter((c) => c.url.includes("harvest.greenhouse.io"));
}

function stubSequence(responses: Array<{ body: string; status?: number; headers?: Record<string, string> }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const impl = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (isToken(String(url))) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return Promise.resolve(
      new Response(next.body, {
        status: next.status ?? 200,
        headers: { "content-type": "application/json", ...(next.headers ?? {}) },
      }),
    );
  };
  return { calls, impl };
}

describe("Greenhouse G1 applications.hire / update", () => {
  test("hire POSTs /hire and returns 204 placeholder", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: "", status: 204 }]);
    const result = await executeApplicationsHire({
      ...auth,
      id: "69306314",
      startDate: "2024-01-15",
      openingId: 9,
      closeReasonId: 1,
      fetch: impl,
    });
    expect(result.application).toBeNull();
    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.pathname).toBe("/v3/applications/69306314/hire");
    const body = JSON.parse(String(harvestCalls(calls)[0]!.init?.body));
    expect(body.start_date).toBe("2024-01-15");
    expect(body.opening_id).toBe(9);
    expect(body.close_reason_id).toBe(1);
  });

  test("update PATCHes attribution fields", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: "", status: 204 }]);
    await executeApplicationsUpdate({
      ...auth,
      id: "69306314",
      sourceId: 2,
      recruiterId: 92120,
      fetch: impl,
    });
    const url = new URL(harvestCalls(calls)[0]!.url);
    expect(url.pathname).toBe("/v3/applications/69306314");
    expect(harvestCalls(calls)[0]!.init?.method).toBe("PATCH");
    const body = JSON.parse(String(harvestCalls(calls)[0]!.init?.body));
    expect(body.source_id).toBe(2);
    expect(body.recruiter_id).toBe(92120);
  });
});

describe("Greenhouse G1 agent-tool lists", () => {
  test("application_stages.list / rejection_reasons.list / candidate_tags.list / jobs.list_internal", async () => {
    clearGreenhouseTokenCache();
    for (const [fn, fixture, pathPart, key] of [
      [executeApplicationStagesList, applicationStages, "/v3/application_stages", "applicationStages"],
      [executeRejectionReasonsList, rejectionReasons, "/v3/rejection_reasons", "rejectionReasons"],
      [executeCandidateTagsList, candidateTags, "/v3/candidate_tags", "candidateTags"],
      [executeJobsListInternal, jobsInternal, "/v3/jobs", "jobs"],
    ] as const) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stubSequence([{ body: JSON.stringify(fixture) }]);
      const result = (await (fn as any)({
        ...auth,
        departmentId: key === "jobs" ? 1 : undefined,
        officeId: key === "jobs" ? 2 : undefined,
        fetch: impl,
      })) as any;
      expect(result[key].length).toBeGreaterThan(0);
      const url = new URL(harvestCalls(calls)[0]!.url);
      expect(url.pathname).toBe(pathPart);
      if (key === "jobs") {
        expect(url.searchParams.get("department_id")).toBe("1");
        expect(url.searchParams.get("office_id")).toBe("2");
      }
    }
  });
});

describe("Greenhouse G1 notes", () => {
  test("create NOTE and list with list visibility enums", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: JSON.stringify(noteCreated), status: 201 }]);
    const created = await executeNotesCreate({
      ...auth,
      candidateId: 57683957,
      body: "Good call",
      visibility: "public",
      noteType: "NOTE",
      fetch: impl,
    });
    expect((created as any).id).toBe(1);
    const body = JSON.parse(String(harvestCalls(calls)[0]!.init?.body));
    expect(body.visibility).toBe("public");
    expect(body.note_type).toBe("NOTE");
    expect(body.candidate_id).toBe(57683957);

    clearGreenhouseTokenCache();
    const listed = stubSequence([{ body: JSON.stringify(notesList) }]);
    const result = await executeNotesList({
      ...auth,
      visibility: "publicly_visible",
      fetch: listed.impl,
    });
    expect(result.notes).toHaveLength(1);
    const listUrl = new URL(harvestCalls(listed.calls)[0]!.url);
    expect(listUrl.searchParams.get("visibility")).toBe("publicly_visible");
  });

  test("rejects create visibility on list and email fields on NOTE", async () => {
    await expect(
      executeNotesList({ ...auth, visibility: "public", fetch: async () => new Response("[]") }),
    ).rejects.toThrow(/publicly_visible/);
    await expect(
      executeNotesCreate({
        ...auth,
        candidateId: 1,
        body: "x",
        visibility: "public",
        noteType: "NOTE",
        emailFrom: ["a@b.com"],
        fetch: async () => new Response("{}"),
      }),
    ).rejects.toThrow(/EMAIL/);
  });
});

describe("Greenhouse G1 tags", () => {
  test("apply_tag maps id → candidate_id", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: JSON.stringify(appliedTag), status: 201 }]);
    const result = await executeCandidatesApplyTag({
      ...auth,
      id: "57683957",
      candidateTagId: 55,
      fetch: impl,
    });
    expect((result as any).candidate_id).toBe(57683957);
    const body = JSON.parse(String(harvestCalls(calls)[0]!.init?.body));
    expect(body.candidate_id).toBe(57683957);
    expect(body.candidate_tag_id).toBe(55);
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/applied_candidate_tags");
  });

  test("remove_tag DELETEs applied tag row", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: "", status: 204 }]);
    await executeCandidatesRemoveTag({ ...auth, id: "9001", fetch: impl });
    expect(new URL(harvestCalls(calls)[0]!.url).pathname).toBe("/v3/applied_candidate_tags/9001");
    expect(harvestCalls(calls)[0]!.init?.method).toBe("DELETE");
  });
});

describe("Greenhouse G1 interviews / offers", () => {
  test("create interview requires response_status", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: JSON.stringify(interviewCreated), status: 201 }]);
    await executeInterviewsCreate({
      ...auth,
      applicationId: 69306314,
      jobInterviewId: 4567,
      startsAt: "2017-10-15T15:00:00.000Z",
      endsAt: "2017-10-15T16:00:00.000Z",
      externalEventId: "evt-abc-123",
      interviewers: [{ userId: 92120, responseStatus: "accepted" }],
      fetch: impl,
    });
    const body = JSON.parse(String(harvestCalls(calls)[0]!.init?.body));
    expect(body.interviewers[0].response_status).toBe("accepted");
    expect(body.interviewers[0].user_id).toBe(92120);

    await expect(
      executeInterviewsCreate({
        ...auth,
        applicationId: 1,
        jobInterviewId: 2,
        startsAt: "a",
        endsAt: "b",
        externalEventId: "c",
        interviewers: [{ userId: 1 }],
        fetch: async () => new Response("{}"),
      }),
    ).rejects.toThrow(/responseStatus/);
  });

  test("update/delete interview paths", async () => {
    clearGreenhouseTokenCache();
    const upd = stubSequence([{ body: "", status: 204 }]);
    await executeInterviewsUpdate({ ...auth, id: "997234", location: "HQ", fetch: upd.impl });
    expect(new URL(harvestCalls(upd.calls)[0]!.url).pathname).toBe("/v3/interviews/997234");
    expect(harvestCalls(upd.calls)[0]!.init?.method).toBe("PATCH");

    clearGreenhouseTokenCache();
    const del = stubSequence([{ body: "", status: 204 }]);
    await executeInterviewsDelete({ ...auth, id: "997234", fetch: del.impl });
    expect(harvestCalls(del.calls)[0]!.init?.method).toBe("DELETE");
  });

  test("offers.create returns top-level id", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stubSequence([{ body: JSON.stringify(offerCreated), status: 201 }]);
    const result = await executeOffersCreate({
      ...auth,
      applicationId: 69306314,
      startsOn: "2017-11-01",
      fetch: impl,
    });
    expect((result as any).id).toBe(12345);
    const body = JSON.parse(String(harvestCalls(calls)[0]!.init?.body));
    expect(body.application_id).toBe(69306314);
    expect(body.starts_on).toBe("2017-11-01");
  });
});
