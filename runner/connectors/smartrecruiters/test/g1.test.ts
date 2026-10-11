import { describe, expect, test } from "bun:test";
import {
  executeCandidatesCreate,
  executeApplicationsCreate,
  executeCandidatesUpdate,
  executeApplicationsGet,
  executeApplicationsUpdateStatus,
  executeApplicationsStatusHistory,
  executeCandidatesTagsGet,
  executeCandidatesTagsAdd,
  executeCandidatesTagsReplace,
  executeCandidatesAttachmentsList,
  executeApplicationsAttachmentsList,
  executeApplicationsPropertiesGet,
  executeApplicationsPropertiesUpdate,
  executeApplicationsScreeningAnswersGet,
  executeJobApplicationsGet,
  buildPropertyValues,
} from "../src/g1";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import candidateCreated from "../fixtures/candidate_created.json";
import applicationCreated from "../fixtures/application_created.json";
import candidateUpdated from "../fixtures/candidate_updated.json";
import applicationGet from "../fixtures/application_get.json";
import applicationGetRejected from "../fixtures/application_get_rejected.json";
import statusHistory from "../fixtures/application_status_history.json";
import candidateTags from "../fixtures/candidate_tags.json";
import candidateAttachments from "../fixtures/candidate_attachments.json";
import applicationAttachments from "../fixtures/application_attachments.json";
import applicationProperties from "../fixtures/application_properties.json";
import screeningAnswers from "../fixtures/application_screening_answers.json";
import jobApplicationGet from "../fixtures/job_application_get.json";

const C = "3f6b1c2e-8d4a-4f2b-9a71-5c0e2d9b7a11";
const J = "a51e7c34-2b9d-4e6f-8c10-7d2f4b6e9a03";
const APP = "c4d7e2a9-1f3b-4c6d-9e8a-2b5f7d1c3e60";
const auth = { apiKey: "fixture-smart-token" };

type Reply = { body: unknown; status?: number; headers?: Record<string, string> };

// Every request is served by an injected fetch, in order. No real network.
function stub(replies: Reply[]) {
  const calls: Array<{ method: string; url: URL; headers: Headers; body: unknown }> = [];
  let i = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    const text = init?.body == null ? "" : String(init.body);
    calls.push({ method: req.method, url: new URL(req.url), headers: req.headers, body: text ? JSON.parse(text) : undefined });
    const r = replies[Math.min(i, replies.length - 1)]!;
    i += 1;
    const body = r.body === "" || r.body == null ? null : typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function expectCall(call: { method: string; url: URL; headers: Headers }, method: string, path: string) {
  expect(call.method).toBe(method);
  expect(call.url.hostname).toBe("api.smartrecruiters.com");
  expect(call.url.pathname).toBe(path);
  expect(call.headers.get("x-smarttoken")).toBe("fixture-smart-token");
}

describe("SmartRecruiters G1 creates (effect keys omitted)", () => {
  test("candidates.create POSTs the documented CandidateInput and returns the raw id", async () => {
    const { calls, impl } = stub([{ body: candidateCreated, status: 201 }]);
    const out = await executeCandidatesCreate({
      ...auth,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace.hopper@example.com",
      phoneNumber: "+1 202 555 0147",
      location: { city: "Arlington", countryCode: "us", lat: 38.8816 },
      web: { linkedin: "https://www.linkedin.com/in/grace-hopper-example" },
      tags: ["cobol", "compilers"],
      education: [{ institution: "Yale University", degree: "PhD", startDate: "1930" }],
      experience: [{ title: "Senior Programmer", company: "Remington Rand", current: false }],
      sourceDetails: { sourceTypeId: "API", sourceId: "src-1" },
      internal: false,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expectCall(calls[0]!, "POST", "/candidates");
    expect(calls[0]!.body).toEqual({
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace.hopper@example.com",
      phoneNumber: "+1 202 555 0147",
      location: { city: "Arlington", countryCode: "us", lat: 38.8816 },
      web: { linkedin: "https://www.linkedin.com/in/grace-hopper-example" },
      tags: ["cobol", "compilers"],
      education: [{ institution: "Yale University", degree: "PhD", startDate: "1930" }],
      experience: [{ title: "Senior Programmer", company: "Remington Rand", current: false }],
      sourceDetails: { sourceTypeId: "API", sourceId: "src-1" },
      internal: false,
    });
    expect(out.id).toBe(C);
    expect(out.candidate.firstName).toBe("Grace");
    expect(out.candidate.email).toBe("grace.hopper@example.com");
    expect(out.candidate.primaryJobId).toBeNull();
  });

  test("candidates.create requires firstName, lastName and email", async () => {
    const { impl } = stub([{ body: candidateCreated, status: 201 }]);
    await expect(
      executeCandidatesCreate({ ...auth, firstName: "Grace", lastName: "", email: "g@example.com", fetch: impl }),
    ).rejects.toThrow("lastName");
  });

  test("applications.create POSTs /jobs/{jobId}/candidates and surfaces the primary assignment", async () => {
    const { calls, impl } = stub([{ body: applicationCreated, status: 201 }]);
    const out = await executeApplicationsCreate({
      ...auth,
      jobId: J,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace.hopper@example.com",
      fetch: impl,
    });
    expectCall(calls[0]!, "POST", `/jobs/${J}/candidates`);
    expect(calls[0]!.body).toEqual({ firstName: "Grace", lastName: "Hopper", email: "grace.hopper@example.com" });
    expect(out.id).toBe(C);
    expect(out.jobId).toBe(J);
    expect(out.candidate.primaryJobId).toBe(J);
    expect(out.candidate.primaryStatus).toBe("NEW");
  });

  test("a create response without an id is an upstream error", async () => {
    const { impl } = stub([{ body: { firstName: "x" }, status: 201 }]);
    await expect(
      executeCandidatesCreate({ ...auth, firstName: "a", lastName: "b", email: "c@example.com", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("SmartRecruiters G1 candidates.update", () => {
  test("PATCHes only the observed personal fields", async () => {
    const { calls, impl } = stub([{ body: candidateUpdated }]);
    const out = await executeCandidatesUpdate({ ...auth, id: C, firstName: "Grace B.", phoneNumber: "+1 202 555 0199", fetch: impl });
    expectCall(calls[0]!, "PATCH", `/candidates/${C}`);
    expect(calls[0]!.body).toEqual({ firstName: "Grace B.", phoneNumber: "+1 202 555 0199" });
    expect(out.candidate?.firstName).toBe("Grace B.");
    expect(out.candidate?.phoneNumber).toBe("+1 202 555 0199");
  });

  test("rejects an empty update without calling upstream", async () => {
    const { calls, impl } = stub([{ body: candidateUpdated }]);
    await expect(executeCandidatesUpdate({ ...auth, id: C, fetch: impl })).rejects.toThrow("at least one");
    expect(calls).toHaveLength(0);
  });
});

describe("SmartRecruiters G1 applications.get / update_status", () => {
  test("applications.get normalizes the documented Application shape", async () => {
    const { calls, impl } = stub([{ body: applicationGet }]);
    const out = await executeApplicationsGet({ ...auth, id: C, jobId: J, fetch: impl });
    expectCall(calls[0]!, "GET", `/candidates/${C}/jobs/${J}`);
    expect(out.application).toEqual({
      candidateId: C,
      jobId: J,
      applicationId: APP,
      status: "IN_REVIEW",
      subStatus: "Recruiter screen",
      startsOn: null,
      source: "API",
      reasonOfRejection: null,
      reasonOfWithdrawal: null,
      url: `https://api.smartrecruiters.com/candidates/${C}/jobs/${J}`,
    });
  });

  test("update_status PUTs status/subStatus/reason and accepts 204", async () => {
    const { calls, impl } = stub([{ body: "", status: 204 }]);
    const out = await executeApplicationsUpdateStatus({
      ...auth,
      id: C,
      jobId: J,
      status: "REJECTED",
      subStatus: "Not a fit",
      reason: "7c2e9d4b-3a1f-4b8e-a6d5-0f9c1e2b3a47",
      fetch: impl,
    });
    expectCall(calls[0]!, "PUT", `/candidates/${C}/jobs/${J}/status`);
    expect(calls[0]!.body).toEqual({ status: "REJECTED", subStatus: "Not a fit", reason: "7c2e9d4b-3a1f-4b8e-a6d5-0f9c1e2b3a47" });
    expect(out).toEqual({ ok: true });
  });

  test("update_status rejects reason on a non-terminal status and unknown statuses", async () => {
    const { calls, impl } = stub([{ body: "", status: 204 }]);
    await expect(
      executeApplicationsUpdateStatus({ ...auth, id: C, jobId: J, status: "INTERVIEW", reason: "r1", fetch: impl }),
    ).rejects.toThrow("REJECTED or WITHDRAWN");
    await expect(
      executeApplicationsUpdateStatus({ ...auth, id: C, jobId: J, status: "MOVED" as never, fetch: impl }),
    ).rejects.toThrow("status must be one of");
    expect(calls).toHaveLength(0);
  });

  test("status_history maps changedOn/status/subStatus", async () => {
    const { calls, impl } = stub([{ body: statusHistory }]);
    const out = await executeApplicationsStatusHistory({ ...auth, id: C, jobId: J, fetch: impl });
    expectCall(calls[0]!, "GET", `/candidates/${C}/jobs/${J}/status/history`);
    expect(out.total).toBe(3);
    expect(out.history.map((h) => h.status)).toEqual(["NEW", "IN_REVIEW", "REJECTED"]);
    expect(out.history[1]).toEqual({ changedOn: "2026-10-05T19:10:02.000Z", status: "IN_REVIEW", subStatus: "Recruiter screen" });
  });
});

describe("SmartRecruiters G1 tags", () => {
  test("tags.get / add / replace hit /candidates/{id}/tags with the documented body", async () => {
    const get = stub([{ body: candidateTags }]);
    expect((await executeCandidatesTagsGet({ ...auth, id: C, fetch: get.impl })).tags).toEqual(["cobol", "compilers", "navy-reserve"]);
    expectCall(get.calls[0]!, "GET", `/candidates/${C}/tags`);

    const add = stub([{ body: { tags: ["navy-reserve"] }, status: 201 }]);
    await executeCandidatesTagsAdd({ ...auth, id: C, tags: ["navy-reserve"], fetch: add.impl });
    expectCall(add.calls[0]!, "POST", `/candidates/${C}/tags`);
    expect(add.calls[0]!.body).toEqual({ tags: ["navy-reserve"] });

    const put = stub([{ body: { tags: [] }, status: 201 }]);
    expect((await executeCandidatesTagsReplace({ ...auth, id: C, tags: [], fetch: put.impl })).tags).toEqual([]);
    expectCall(put.calls[0]!, "PUT", `/candidates/${C}/tags`);
    expect(put.calls[0]!.body).toEqual({ tags: [] });
  });

  test("tags.add needs at least one tag and enforces 150-char tags", async () => {
    const { impl } = stub([{ body: candidateTags }]);
    await expect(executeCandidatesTagsAdd({ ...auth, id: C, tags: [], fetch: impl })).rejects.toThrow("at least 1");
    await expect(executeCandidatesTagsAdd({ ...auth, id: C, tags: ["x".repeat(151)], fetch: impl })).rejects.toThrow("1-150");
  });
});

describe("SmartRecruiters G1 attachments / properties / screening / job application", () => {
  test("attachment lists return metadata and download URLs", async () => {
    const cand = stub([{ body: candidateAttachments }]);
    const a = await executeCandidatesAttachmentsList({ ...auth, id: C, fetch: cand.impl });
    expectCall(cand.calls[0]!, "GET", `/candidates/${C}/attachments`);
    expect(a.total).toBe(2);
    expect(a.attachments[0]).toEqual({
      id: "b1d3f5a7-9c2e-4a6b-8d0f-1e3a5c7b9d21",
      name: "Grace_Hopper_CV.pdf",
      type: "RESUME",
      contentType: "application/pdf",
      downloadUrl: "https://api.smartrecruiters.com/candidates/attachments/b1d3f5a7-9c2e-4a6b-8d0f-1e3a5c7b9d21",
    });

    const job = stub([{ body: applicationAttachments }]);
    const b = await executeApplicationsAttachmentsList({ ...auth, id: C, jobId: J, fetch: job.impl });
    expectCall(job.calls[0]!, "GET", `/candidates/${C}/jobs/${J}/attachments`);
    expect(b.attachments.map((x) => x.type)).toEqual(["COVER_LETTER"]);
  });

  test("properties.get forwards context/includeMultiSelect and keeps typed values", async () => {
    const { calls, impl } = stub([{ body: applicationProperties }]);
    const out = await executeApplicationsPropertiesGet({ ...auth, id: C, jobId: J, context: "OFFER_FORM", includeMultiSelect: true, fetch: impl });
    expectCall(calls[0]!, "GET", `/candidates/${C}/jobs/${J}/properties`);
    expect(calls[0]!.url.searchParams.get("context")).toBe("OFFER_FORM");
    expect(calls[0]!.url.searchParams.get("includeMultiSelect")).toBe("true");
    expect(out.properties.map((p) => [p.key, p.type, p.value])).toEqual([
      ["noticePeriod", "NUMBER", 4],
      ["relocation", "BOOLEAN", true],
      ["expectedSalary", "CURRENCY", { code: "USD", value: 185000 }],
      ["clearance", "SINGLE_SELECT", "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c"],
    ]);
    expect(out.properties[3]!.selectedValueLabels).toEqual([{ id: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c", label: "Secret" }]);
  });

  test("properties.update maps typed entries onto the documented [{id, value}] body", async () => {
    const { calls, impl } = stub([{ body: "", status: 204 }]);
    const out = await executeApplicationsPropertiesUpdate({
      ...auth,
      id: C,
      jobId: J,
      properties: [
        { id: "noticePeriod", numberValue: 6 },
        { id: "relocation", booleanValue: false },
        { id: "expectedSalary", currencyValue: { code: "USD", value: 190000 } },
        { id: "clearance", textValue: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c" },
        { id: "languages", optionIds: [] },
        { id: "legacyNote" },
      ],
      fetch: impl,
    });
    expectCall(calls[0]!, "PUT", `/candidates/${C}/jobs/${J}/properties`);
    expect(calls[0]!.body).toEqual([
      { id: "noticePeriod", value: 6 },
      { id: "relocation", value: false },
      { id: "expectedSalary", value: { code: "USD", value: 190000 } },
      { id: "clearance", value: "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c" },
      { id: "languages", value: [] },
      { id: "legacyNote" },
    ]);
    expect(out).toEqual({ ok: true, updated: 6 });
  });

  test("properties.update rejects two value fields and duplicate option ids", () => {
    expect(() => buildPropertyValues([{ id: "a", textValue: "x", numberValue: 1 }])).toThrow("at most one");
    expect(() => buildPropertyValues([{ id: "a", optionIds: ["o1", "o1"] }])).toThrow("must not repeat");
    expect(() => buildPropertyValues([])).toThrow("1-100");
  });

  test("screening_answers.get keeps question labels and answer values", async () => {
    const { calls, impl } = stub([{ body: screeningAnswers }]);
    const out = await executeApplicationsScreeningAnswersGet({ ...auth, id: C, jobId: J, fetch: impl });
    expectCall(calls[0]!, "GET", `/candidates/${C}/jobs/${J}/screening-answers`);
    expect(out.total).toBe(2);
    expect(out.answers[0]!.label).toBe("Do you have a current driver's license?");
    expect(out.answers[0]!.records[0]!.fields[0]!.values).toEqual([{ id: "1", label: "Yes" }]);
  });

  test("job_applications.get calls the v202112 Job Applications API", async () => {
    const { calls, impl } = stub([{ body: jobApplicationGet }]);
    const out = await executeJobApplicationsGet({ ...auth, jobApplicationId: APP, fetch: impl });
    expectCall(calls[0]!, "GET", `/job-applications-api/v202112/job-applications/${APP}`);
    expect(out.jobApplication).toEqual({
      id: APP,
      status: "IN_REVIEW",
      subStatus: "Recruiter screen",
      profileId: C,
      jobId: J,
      sourceIdentifier: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
      createdAt: "2026-10-05T18:42:11.512Z",
    });
  });

  test("404 maps to CONNECTOR_UPSTREAM_ERROR and 429 to CONNECTOR_RATE_LIMITED", async () => {
    const nf = stub([{ body: { message: "Candidate is not assigned to given job" }, status: 404 }]);
    await expect(
      executeApplicationsUpdateStatus({ ...auth, id: C, jobId: J, status: "INTERVIEW", fetch: nf.impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    const rl = stub([{ body: "{}", status: 429, headers: { "retry-after": "7" } }]);
    await expect(executeCandidatesTagsGet({ ...auth, id: C, fetch: rl.impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 7,
    });
  });

  test("path ids are validated before any request", async () => {
    const { calls, impl } = stub([{ body: applicationGet }]);
    await expect(executeApplicationsGet({ ...auth, id: "../users", jobId: J, fetch: impl })).rejects.toThrow("id may only contain");
    expect(calls).toHaveLength(0);
  });
});

describe("SmartRecruiters G1 through the registry (effect policy)", () => {
  async function run(action: string, input: Record<string, unknown>) {
    const result = defaultConnectorRegistry.executeAction("smartrecruiters", action, input);
    expect(result.ok).toBe(true);
    return await (result as { ok: true; output: unknown }).output;
  }

  test("applications.update_status reconciles via applications.get on the same id/jobId", async () => {
    const { calls, impl } = stub([{ body: "", status: 204 }, { body: applicationGetRejected }]);
    const out = (await run("applications.update_status", {
      ...auth,
      id: C,
      jobId: J,
      status: "REJECTED",
      reason: "7c2e9d4b-3a1f-4b8e-a6d5-0f9c1e2b3a47",
      fetch: impl,
    })) as { application: Record<string, unknown> };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      `PUT /candidates/${C}/jobs/${J}/status`,
      `GET /candidates/${C}/jobs/${J}`,
    ]);
    expect(out.application.status).toBe("REJECTED");
    expect(out.application.reasonOfRejection).toEqual({ id: "7c2e9d4b-3a1f-4b8e-a6d5-0f9c1e2b3a47", label: "Skills mismatch" });
  });

  test("candidates.tags.add reconciles via candidates.tags.get", async () => {
    const { calls, impl } = stub([{ body: { tags: ["navy-reserve"] }, status: 201 }, { body: candidateTags }]);
    const out = (await run("candidates.tags.add", { ...auth, id: C, tags: ["navy-reserve"], fetch: impl })) as { tags: string[] };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([`POST /candidates/${C}/tags`, `GET /candidates/${C}/tags`]);
    expect(out.tags).toEqual(["cobol", "compilers", "navy-reserve"]);
  });

  test("candidates.update reconciles via candidates.get", async () => {
    const { calls, impl } = stub([{ body: candidateUpdated }, { body: candidateUpdated }]);
    const out = (await run("candidates.update", { ...auth, id: C, firstName: "Grace B.", fetch: impl })) as {
      candidate: { firstName: string };
    };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([`PATCH /candidates/${C}`, `GET /candidates/${C}`]);
    expect(out.candidate.firstName).toBe("Grace B.");
  });

  test("creates and the batch properties upsert make exactly one call (no observe)", async () => {
    const created = stub([{ body: applicationCreated, status: 201 }]);
    const out = (await run("applications.create", {
      ...auth,
      jobId: J,
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace.hopper@example.com",
      fetch: created.impl,
    })) as { id: string };
    expect(created.calls).toHaveLength(1);
    expect(out.id).toBe(C);

    const props = stub([{ body: "", status: 204 }]);
    await run("applications.properties.update", { ...auth, id: C, jobId: J, properties: [{ id: "noticePeriod", numberValue: 6 }], fetch: props.impl });
    expect(props.calls).toHaveLength(1);
  });
});
