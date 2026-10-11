import { describe, expect, test } from "bun:test";
import {
  executeJobNotesDelete,
  executeJobInterviewsList,
  executeDefaultInterviewersList,
  executeInterviewerTagsList,
  executeReferrersList,
  executeEmailTemplatesList,
} from "../src/g4";
import { clearGreenhouseTokenCache } from "../src/http";
import manifest from "../manifest.json";
import jobInterviews from "../fixtures/job_interviews_list.json";
import defaultInterviewers from "../fixtures/default_interviewers_list.json";
import interviewerTags from "../fixtures/interviewer_tags_list.json";
import referrers from "../fixtures/referrers_list.json";
import emailTemplates from "../fixtures/email_templates_list.json";
import jobNoteDeleted from "../fixtures/job_note_deleted.json";

const auth = { clientId: "fixture-client", clientSecret: "fixture-secret" };

function harvestCalls(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls.filter((c) => c.url.includes("harvest.greenhouse.io"));
}

function stub(body: string, status = 200, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("auth.greenhouse.io/token")) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(body, { status, headers: { "content-type": "application/json", ...headers } }),
    );
  };
  return { calls, impl };
}

const noNet = (async () => {
  throw new Error("network must not be called");
}) as any;

function first(calls: Array<{ url: string; init?: RequestInit }>) {
  const call = harvestCalls(calls)[0]!;
  const headers = call.init?.headers as Record<string, string> | undefined;
  return { url: new URL(call.url), method: call.init?.method, auth: headers?.Authorization };
}

describe("Greenhouse G4 job_notes.delete", () => {
  test("DELETEs /v3/job_notes/{id} and returns { ok: true }", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(jobNoteDeleted));
    expect(await executeJobNotesDelete({ ...auth, id: "31", fetch: impl })).toEqual({ ok: true });
    const call = first(calls);
    expect(call.method).toBe("DELETE");
    expect(call.url.pathname).toBe("/v3/job_notes/31");
    expect(call.auth).toBe("Bearer tok");
  });

  test("404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    clearGreenhouseTokenCache();
    const { impl } = stub(JSON.stringify({ errors: [{ message: "Not Found" }] }), 404);
    await expect(executeJobNotesDelete({ ...auth, id: "404404", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects unsafe path id before network", async () => {
    await expect(executeJobNotesDelete({ ...auth, id: "../jobs", fetch: noNet })).rejects.toThrow();
  });
});

describe("Greenhouse G4 lookup lists", () => {
  test("map filters, paging and cursor for all five lists", async () => {
    const cases = [
      [executeJobInterviewsList, jobInterviews, "/v3/job_interviews", "jobInterviews",
        { jobIds: [1, 2], jobInterviewStageIds: 3, active: true, schedulingType: "needs_scheduling" },
        { job_ids: "1,2", job_interview_stage_ids: "3", active: "true", scheduling_type: "needs_scheduling" }],
      [executeDefaultInterviewersList, defaultInterviewers, "/v3/default_interviewers", "defaultInterviewers",
        { userIds: [7], interviewKitIds: "4,5" }, { user_ids: "7", interview_kit_ids: "4,5" }],
      [executeInterviewerTagsList, interviewerTags, "/v3/interviewer_tags", "interviewerTags", {}, {}],
      [executeReferrersList, referrers, "/v3/referrers", "referrers", { userIds: [8, 9] }, { user_ids: "8,9" }],
      [executeEmailTemplatesList, emailTemplates, "/v3/email_templates", "emailTemplates",
        { emailType: "candidate_rejection", fromType: "organization_email" },
        { email_type: "candidate_rejection", from_type: "organization_email" }],
    ] as const;
    for (const [fn, fixture, path, key, extra, expected] of cases) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stub(JSON.stringify(fixture), 200, {
        link: '<https://harvest.greenhouse.io/v3/x?cursor=NXT&per_page=3>; rel="next"',
      });
      const result = (await (fn as any)({ ...auth, ...extra, ids: [11], perPage: 3, cursor: "C0", fetch: impl })) as any;
      expect(result[key].length).toBeGreaterThan(0);
      expect(result.nextCursor).toBe("NXT");
      const { url, method } = first(calls);
      expect(method).toBe("GET");
      expect(url.pathname).toBe(path);
      expect(url.searchParams.get("ids")).toBe("11");
      expect(url.searchParams.get("per_page")).toBe("3");
      expect(url.searchParams.get("cursor")).toBe("C0");
      for (const [k, v] of Object.entries(expected)) expect(url.searchParams.get(k)).toBe(v as string);
    }
  });

  test("no filters → bare path; null cursor when no Link header", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(interviewerTags));
    const result = await executeInterviewerTagsList({ ...auth, fetch: impl });
    expect(result.nextCursor).toBeNull();
    expect(harvestCalls(calls)[0]!.url).toBe("https://harvest.greenhouse.io/v3/interviewer_tags");
  });

  test("enum filters rejected before network", async () => {
    await expect(executeJobInterviewsList({ ...auth, schedulingType: "phone", fetch: noNet })).rejects.toThrow(
      /schedulingType/,
    );
    await expect(executeEmailTemplatesList({ ...auth, fromType: "anyone", fetch: noNet })).rejects.toThrow(
      /fromType/,
    );
  });
});

describe("Greenhouse G4 manifest", () => {
  const G4 = {
    "job_notes.delete": "destructive",
    "job_interviews.list": "read",
    "default_interviewers.list": "read",
    "interviewer_tags.list": "read",
    "referrers.list": "read",
    "email_templates.list": "read",
  } as const;

  test("6 G4 ops: agent actions, locked sideEffects, no effect keys", () => {
    for (const [id, sideEffect] of Object.entries(G4)) {
      const op = (manifest.operations as Record<string, Record<string, unknown>>)[id]!;
      expect(op).toBeTruthy();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(sideEffect);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    const del = manifest.operations["job_notes.delete"] as { inputSchema: { required: string[] } };
    expect(del.inputSchema.required).toEqual(["id"]);
  });
});
