import { describe, expect, test } from "bun:test";
import {
  executeJobsSearch,
  executeJobsCreate,
  executeJobsUpdate,
  executeJobsUpdateStatus,
  executeJobsStatusHistory,
  executeJobsHiringTeamGet,
  executeJobsHiringTeamAdd,
  executeJobsHiringTeamRemove,
  executeJobsNoteGet,
  executeJobsNoteUpdate,
  executeJobsPublish,
  executeJobsUnpublish,
  executeJobsPublicationsList,
  executeJobsPositionsList,
  executePostingsGet,
  buildJobsSearchQuery,
  buildJobInput,
} from "../src/g2";
import { candidateIdSegment, jobIdSegment, stripPrefixedId, userIdSegment } from "../src/ids";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import jobsSearch from "../fixtures/jobs_search.json";
import jobCreated from "../fixtures/job_created.json";
import jobUpdated from "../fixtures/job_updated.json";
import jobGetSourcing from "../fixtures/job_get_sourcing.json";
import jobStatusUpdated from "../fixtures/job_status_updated.json";
import jobStatusHistory from "../fixtures/job_status_history.json";
import hiringTeam from "../fixtures/job_hiring_team.json";
import memberAdded from "../fixtures/job_hiring_team_member_added.json";
import jobNote from "../fixtures/job_note.json";
import publications from "../fixtures/job_publications.json";
import positions from "../fixtures/job_positions.json";
import postingGet from "../fixtures/posting_get.json";

const J = "86272861-2022-40fa-aa21-ba081f329133";
const U2 = "5f0c7e2ab1cd2e0001d63a9b";
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

const createInput = {
  title: "Staff Compiler Engineer",
  refNumber: "REF-2026-0412",
  departmentId: "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  location: { city: "San Francisco", countryCode: "us", regionCode: "ca", hybrid: true, hybridDescription: "3 days in office" },
  industryId: "computer_software",
  functionId: "engineering",
  typeOfEmploymentId: "permanent",
  experienceLevelId: "mid_senior_level",
  compensation: { min: 180000, max: 230000, currency: "USD", period: "YEARLY" as const },
  jobAd: { language: "en", jobDescription: { title: "Job Description", text: "<p>Own the backend.</p>" } },
  properties: [{ id: "costCenter", valueId: "cc-410" }],
};

describe("SmartRecruiters G2 jobs.search", () => {
  test("GETs /jobs with repeatable filters and pageId forcing sort=job_id", async () => {
    const { calls, impl } = stub([{ body: jobsSearch }]);
    const out = await executeJobsSearch({
      ...auth,
      q: "compiler",
      limit: 2,
      pageId: "abc",
      city: ["San Francisco", "Berlin"],
      statuses: ["SOURCING", "ON_HOLD"],
      postingStatus: "PUBLIC",
      hiringTeamMemberId: [U2],
      fetch: impl,
    });
    expectCall(calls[0]!, "GET", "/jobs");
    const sp = calls[0]!.url.searchParams;
    expect(sp.get("pageId")).toBe("abc");
    expect(sp.get("sort")).toBe("job_id");
    expect(sp.getAll("city")).toEqual(["San Francisco", "Berlin"]);
    expect(sp.getAll("statuses")).toEqual(["SOURCING", "ON_HOLD"]);
    expect(sp.has("offset")).toBe(false);
    expect(sp.has("status")).toBe(false);
    expect(out.total).toBe(57);
    expect(out.nextPageId).toBe("NWQ1ZTliMWE4YzFiMmEwMDAxZjNjMmQx");
    expect(out.jobs[0]).toEqual({
      id: `sr-job:${J}`,
      title: "Staff Compiler Engineer",
      refNumber: "REF-2026-0412",
      status: "SOURCING",
      postingStatus: "PUBLIC",
      department: "Engineering",
      departmentId: "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
      location: "San Francisco, California, United States",
      remote: false,
      language: "en",
      createdAt: "2026-09-14T08:12:40.118Z",
      updatedAt: "2026-10-04T16:20:03.552Z",
      lastActivityAt: "2026-10-05T19:44:10.000Z",
    });
    expect(out.jobs[1]!.departmentId).toBeNull();
  });

  test("rejects pageId with sort=default and sends no query by default", () => {
    expect(() => buildJobsSearchQuery({ ...auth, pageId: "abc", sort: "default" })).toThrow("job_id");
    expect(buildJobsSearchQuery({ ...auth })).toBe("");
    expect(() => buildJobsSearchQuery({ ...auth, limit: 101 })).toThrow("1-100");
  });
});

describe("SmartRecruiters G2 jobs.create / update / update_status", () => {
  test("jobs.create POSTs the documented JobInput ({id} refs) and returns the raw id", async () => {
    const { calls, impl } = stub([{ body: jobCreated, status: 201 }]);
    const out = await executeJobsCreate({ ...auth, ...createInput, fetch: impl });
    expectCall(calls[0]!, "POST", "/jobs");
    expect(calls[0]!.body).toEqual({
      title: "Staff Compiler Engineer",
      refNumber: "REF-2026-0412",
      department: { id: "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f" },
      location: { city: "San Francisco", countryCode: "us", regionCode: "ca", hybrid: true, hybridDescription: "3 days in office" },
      industry: { id: "computer_software" },
      function: { id: "engineering" },
      typeOfEmployment: { id: "permanent" },
      experienceLevel: { id: "mid_senior_level" },
      compensation: { min: 180000, max: 230000, currency: "USD", period: "YEARLY" },
      jobAd: { sections: { jobDescription: { title: "Job Description", text: "<p>Own the backend.</p>" } }, language: { code: "en" } },
      properties: [{ id: "costCenter", value: { id: "cc-410" } }],
    });
    expect(out.id).toBe(`sr-job:${J}`);
    expect(out.job.title).toBe("Staff Compiler Engineer");
    expect(out.job.id).toBe(`sr-job:${J}`);
    expect(out.job.status).toBe("CREATED");
  });

  test("jobs.create location takes identifier xor city+countryCode", () => {
    expect(buildJobInput({ ...auth, ...createInput, location: { identifier: "HQ-SF", remote: false } }).location).toEqual({
      identifier: "HQ-SF",
      remote: false,
    });
    expect(() => buildJobInput({ ...auth, ...createInput, location: { identifier: "HQ-SF", city: "SF" } })).toThrow("mutually exclusive");
    expect(() => buildJobInput({ ...auth, ...createInput, location: { city: "SF" } })).toThrow("location.countryCode");
    expect(() =>
      buildJobInput({ ...auth, ...createInput, properties: [{ id: "x", valueId: "a", valueExternalCode: "b" }] }),
    ).toThrow("not both");
  });

  test("jobs.update sends a JSON Patch for title/refNumber only", async () => {
    const { calls, impl } = stub([{ body: jobUpdated }]);
    const out = await executeJobsUpdate({ ...auth, id: J, title: "Principal Compiler Engineer", refNumber: "REF-2026-0412-P", fetch: impl });
    expectCall(calls[0]!, "PATCH", `/jobs/${J}`);
    expect(calls[0]!.headers.get("content-type")).toBe("application/json-patch+json");
    expect(calls[0]!.body).toEqual([
      { op: "add", path: "/title", value: "Principal Compiler Engineer" },
      { op: "add", path: "/refNumber", value: "REF-2026-0412-P" },
    ]);
    expect(out.job?.title).toBe("Principal Compiler Engineer");
    expect(out.job?.refNumber).toBe("REF-2026-0412-P");
  });

  test("jobs.update rejects an empty patch without calling upstream", async () => {
    const { calls, impl } = stub([{ body: jobUpdated }]);
    await expect(executeJobsUpdate({ ...auth, id: J, fetch: impl })).rejects.toThrow("title or refNumber");
    expect(calls).toHaveLength(0);
  });

  test("jobs.update_status PUTs the documented JobStatusUpdate", async () => {
    const { calls, impl } = stub([{ body: jobStatusUpdated, status: 201 }]);
    const out = await executeJobsUpdateStatus({ ...auth, id: J, status: "SOURCING", fetch: impl });
    expectCall(calls[0]!, "PUT", `/jobs/${J}/status`);
    expect(calls[0]!.body).toEqual({ status: "SOURCING" });
    expect(out).toEqual({ status: "SOURCING" });
    await expect(executeJobsUpdateStatus({ ...auth, id: J, status: "OTHER" as never, fetch: impl })).rejects.toThrow("status must be one of");
  });

  test("jobs.status_history maps changedOn/status", async () => {
    const { calls, impl } = stub([{ body: jobStatusHistory }]);
    const out = await executeJobsStatusHistory({ ...auth, id: J, fetch: impl });
    expectCall(calls[0]!, "GET", `/jobs/${J}/status/history`);
    expect(out).toEqual({
      history: [
        { changedOn: "2026-09-14T08:12:40.118Z", status: "CREATED" },
        { changedOn: "2026-10-05T20:05:44.310Z", status: "SOURCING" },
      ],
      total: 2,
    });
  });
});

describe("SmartRecruiters G2 hiring team / note / publication / positions", () => {
  test("hiring team get/add/remove", async () => {
    const get = stub([{ body: hiringTeam }]);
    const team = await executeJobsHiringTeamGet({ ...auth, id: J, fetch: get.impl });
    expectCall(get.calls[0]!, "GET", `/jobs/${J}/hiring-team`);
    expect(team.members.map((m) => m.role)).toEqual(["HIRING_MANAGER", "RECRUITER"]);

    const add = stub([{ body: memberAdded }]);
    const added = await executeJobsHiringTeamAdd({ ...auth, id: J, userId: U2, role: "RECRUITER", fetch: add.impl });
    expectCall(add.calls[0]!, "POST", `/jobs/${J}/hiring-team`);
    expect(add.calls[0]!.body).toEqual({ id: U2, role: "RECRUITER" });
    expect(added).toEqual({ jobId: `sr-job:${J}`, member: { id: U2, role: "RECRUITER" } });

    const del = stub([{ body: "", status: 204 }]);
    expect(await executeJobsHiringTeamRemove({ ...auth, id: J, userId: U2, fetch: del.impl })).toEqual({ ok: true });
    expectCall(del.calls[0]!, "DELETE", `/jobs/${J}/hiring-team/${U2}`);
  });

  test("hiring_team.remove 404 maps to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = stub([{ body: { message: "User is not a member of the hiring team" }, status: 404 }]);
    await expect(executeJobsHiringTeamRemove({ ...auth, id: J, userId: U2, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("note get/update", async () => {
    const get = stub([{ body: jobNote }]);
    expect(await executeJobsNoteGet({ ...auth, id: J, fetch: get.impl })).toEqual({ content: jobNote.content });
    expectCall(get.calls[0]!, "GET", `/jobs/${J}/note`);
    const put = stub([{ body: { content: "Hiring paused." } }]);
    expect(await executeJobsNoteUpdate({ ...auth, id: J, content: "Hiring paused.", fetch: put.impl })).toEqual({ content: "Hiring paused." });
    expectCall(put.calls[0]!, "PUT", `/jobs/${J}/note`);
    expect(put.calls[0]!.body).toEqual({ content: "Hiring paused." });
  });

  test("publish / unpublish / publications.list", async () => {
    const pub = stub([{ body: "", status: 204 }]);
    await executeJobsPublish({ ...auth, id: J, visibility: "INTERNAL", aggregators: false, delayPublicInDays: 3, fetch: pub.impl });
    expectCall(pub.calls[0]!, "POST", `/jobs/${J}/publication`);
    expect(pub.calls[0]!.body).toEqual({ aggregators: false, visibility: "INTERNAL", delayPublicInDays: 3 });

    const un = stub([{ body: "", status: 204 }]);
    expect(await executeJobsUnpublish({ ...auth, id: J, fetch: un.impl })).toEqual({ ok: true });
    expectCall(un.calls[0]!, "DELETE", `/jobs/${J}/publication`);

    const list = stub([{ body: publications }]);
    const out = await executeJobsPublicationsList({ ...auth, id: J, activeOnly: false, fetch: list.impl });
    expectCall(list.calls[0]!, "GET", `/jobs/${J}/publication`);
    expect(list.calls[0]!.url.searchParams.get("activeOnly")).toBe("false");
    expect(out.publications).toHaveLength(3);
    expect(out.publications[2]).toEqual({
      sourceName: "Internal careers page",
      type: "INTERNAL",
      publishedOn: "2026-09-20T09:00:00.000Z",
      unpublishedOn: "2026-10-01T09:00:00.000Z",
      postingId: null,
    });
  });

  test("positions.list keeps pending approvals separate", async () => {
    const { calls, impl } = stub([{ body: positions }]);
    const out = await executeJobsPositionsList({ ...auth, id: J, fetch: impl });
    expectCall(calls[0]!, "GET", `/jobs/${J}/positions`);
    expect(out.total).toBe(2);
    expect(out.positions.map((p) => p.positionId)).toEqual(["POS-0412-1", "POS-0412-2"]);
    expect(out.positionsPendingApproval[0]).toMatchObject({ id: null, positionId: "POS-0412-3", status: "PENDING_NEW" });
  });
});

describe("SmartRecruiters G2 postings.get (public Posting API)", () => {
  test("GETs the posting without credentials and normalizes the live shape", async () => {
    const { calls, impl } = stub([{ body: postingGet }]);
    const out = await executePostingsGet({ company: "AcmeGroup", postingId: "744000153583409", sourceTypeId: "st1", fetch: impl });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe("/v1/companies/AcmeGroup/postings/744000153583409");
    expect(calls[0]!.url.searchParams.get("sourceTypeId")).toBe("st1");
    expect(calls[0]!.headers.get("x-smarttoken")).toBeNull();
    expect(out.posting).toMatchObject({
      id: "744000153583409",
      uuid: "51fc12f7-9acd-43fa-8c41-238483561c31",
      jobId: `sr-job:${J}`,
      title: "Ingeniero de Procesos",
      refNumber: "REF297732R",
      company: "Acme Group",
      location: "Celaya Planta, mx",
      remote: false,
      function: "Engineering",
      typeOfEmployment: "Full-time",
      visibility: "PUBLIC",
      active: true,
      releasedAt: "2026-10-05T17:59:12.144Z",
    });
    expect(out.posting?.sections.jobDescription?.text).toBe("<p>Own the reliability test plan for the line.</p>");
  });
});



describe("SmartRecruiters G2 id consistency (raw vs sr-job:)", () => {
  type JobIdOp = [string, (id: string, impl: typeof fetch) => Promise<unknown>, Reply];
  const JOB_ID_OPS: JobIdOp[] = [
    ["jobs.update", (id, fetch) => executeJobsUpdate({ ...auth, id, title: "T", fetch }), { body: jobUpdated }],
    ["jobs.update_status", (id, fetch) => executeJobsUpdateStatus({ ...auth, id, status: "SOURCING", fetch }), { body: jobStatusUpdated, status: 201 }],
    ["jobs.status_history", (id, fetch) => executeJobsStatusHistory({ ...auth, id, fetch }), { body: jobStatusHistory }],
    ["jobs.hiring_team.get", (id, fetch) => executeJobsHiringTeamGet({ ...auth, id, fetch }), { body: hiringTeam }],
    ["jobs.hiring_team.add", (id, fetch) => executeJobsHiringTeamAdd({ ...auth, id, userId: U2, role: "RECRUITER", fetch }), { body: memberAdded }],
    ["jobs.hiring_team.remove", (id, fetch) => executeJobsHiringTeamRemove({ ...auth, id, userId: U2, fetch }), { body: "", status: 204 }],
    ["jobs.note.get", (id, fetch) => executeJobsNoteGet({ ...auth, id, fetch }), { body: jobNote }],
    ["jobs.note.update", (id, fetch) => executeJobsNoteUpdate({ ...auth, id, content: "n", fetch }), { body: jobNote }],
    ["jobs.publish", (id, fetch) => executeJobsPublish({ ...auth, id, fetch }), { body: "", status: 204 }],
    ["jobs.unpublish", (id, fetch) => executeJobsUnpublish({ ...auth, id, fetch }), { body: "", status: 204 }],
    ["jobs.publications.list", (id, fetch) => executeJobsPublicationsList({ ...auth, id, activeOnly: true, fetch }), { body: publications }],
    ["jobs.positions.list", (id, fetch) => executeJobsPositionsList({ ...auth, id, fetch }), { body: positions }],
  ];

  test("covers all 12 G2 job-id ops", () => {
    expect(JOB_ID_OPS).toHaveLength(12);
  });

  for (const [name, runOp, reply] of JOB_ID_OPS) {
    test(`${name}: raw and sr-job:-prefixed ids produce the identical request URL`, async () => {
      const raw = stub([reply]);
      await runOp(J, raw.impl);
      const pref = stub([reply]);
      await runOp(`sr-job:${J}`, pref.impl);
      expect(raw.calls).toHaveLength(1);
      expect(pref.calls).toHaveLength(1);
      expect(pref.calls[0]!.method).toBe(raw.calls[0]!.method);
      expect(pref.calls[0]!.url.href).toBe(raw.calls[0]!.url.href);
      expect(raw.calls[0]!.url.pathname).toStartWith(`/jobs/${J}`);
      expect(raw.calls[0]!.url.href).not.toContain("sr-job");
    });

    test(`${name}: unsafe or empty ids are rejected before any request`, async () => {
      for (const bad of ["", "   ", "../x", "a/b", "sr-job:", "sr-job:../x", "sr-job:a/b", "sr-job:sr-job:x", "sr-candidate:x"]) {
        const s = stub([reply]);
        await expect(runOp(bad, s.impl)).rejects.toThrow(/required|letters, digits/);
        expect(s.calls).toHaveLength(0);
      }
    });

    test(`${name}: dot-segment ids (raw or sr-job:) are rejected before any request`, async () => {
      for (const bad of [".", "..", "...", "sr-job:.", "sr-job:.."]) {
        const s = stub([reply]);
        await expect(runOp(bad, s.impl)).rejects.toThrow("must not be a dot segment");
        expect(s.calls).toHaveLength(0);
      }
    });
  }

  type UserIdOp = [string, (userId: string, impl: typeof fetch) => Promise<unknown>, Reply];
  const USER_ID_OPS: UserIdOp[] = [
    ["jobs.hiring_team.add", (userId, fetch) => executeJobsHiringTeamAdd({ ...auth, id: J, userId, role: "RECRUITER", fetch }), { body: memberAdded }],
    ["jobs.hiring_team.remove", (userId, fetch) => executeJobsHiringTeamRemove({ ...auth, id: J, userId, fetch }), { body: "", status: 204 }],
  ];

  for (const [name, runOp, reply] of USER_ID_OPS) {
    test(`${name}: raw and sr-user:-prefixed userId produce the identical request`, async () => {
      const raw = stub([reply]);
      await runOp(U2, raw.impl);
      const pref = stub([reply]);
      await runOp(`sr-user:${U2}`, pref.impl);
      expect(raw.calls).toHaveLength(1);
      expect(pref.calls).toHaveLength(1);
      expect(pref.calls[0]!.method).toBe(raw.calls[0]!.method);
      expect(pref.calls[0]!.url.href).toBe(raw.calls[0]!.url.href);
      expect(pref.calls[0]!.body).toEqual(raw.calls[0]!.body);
      expect(raw.calls[0]!.url.href).not.toContain("sr-user");
      expect(JSON.stringify(raw.calls[0]!.body ?? null)).not.toContain("sr-user");
    });

    test(`${name}: unsafe or empty userId is rejected before any request`, async () => {
      for (const bad of ["", "   ", "../x", "a/b", "sr-user:", "sr-user:../x", "sr-user:sr-user:x", "sr-job:x"]) {
        const s = stub([reply]);
        await expect(runOp(bad, s.impl)).rejects.toThrow(/required|letters, digits/);
        expect(s.calls).toHaveLength(0);
      }
    });

    test(`${name}: dot-segment userId (raw or sr-user:) is rejected before any request`, async () => {
      for (const bad of [".", "..", "sr-user:.", "sr-user:.."]) {
        const s = stub([reply]);
        await expect(runOp(bad, s.impl)).rejects.toThrow("must not be a dot segment");
        expect(s.calls).toHaveLength(0);
      }
    });
  }

  test("hiring_team.add sends the stripped user id in the body", async () => {
    const { calls, impl } = stub([{ body: memberAdded }]);
    await executeJobsHiringTeamAdd({ ...auth, id: J, userId: `sr-user:${U2}`, role: "RECRUITER", fetch: impl });
    expect(calls[0]!.body).toEqual({ id: U2, role: "RECRUITER" });
  });

  test("hiring_team.add returns sr-job:-prefixed jobId for raw and prefixed input", async () => {
    for (const id of [J, `sr-job:${J}`]) {
      const { impl } = stub([{ body: memberAdded }]);
      const out = await executeJobsHiringTeamAdd({ ...auth, id, userId: U2, role: "RECRUITER", fetch: impl });
      expect(out.jobId).toBe(`sr-job:${J}`);
    }
  });
});

describe("SmartRecruiters G2 through the registry (effect policy)", () => {
  async function run(action: string, input: Record<string, unknown>) {
    const result = defaultConnectorRegistry.executeAction("smartrecruiters", action, input);
    expect(result.ok).toBe(true);
    return await (result as { ok: true; output: unknown }).output;
  }

  test("jobs.update_status reconciles via jobs.get on the same id", async () => {
    const { calls, impl } = stub([{ body: jobStatusUpdated, status: 201 }, { body: jobGetSourcing }]);
    const out = (await run("jobs.update_status", { ...auth, id: J, status: "SOURCING", fetch: impl })) as { job: { status: string } };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([`PUT /jobs/${J}/status`, `GET /jobs/${J}`]);
    expect(out.job.status).toBe("SOURCING");
  });

  test("jobs.update does not reconcile (PATCH may trigger approval)", async () => {
    const { calls, impl } = stub([{ body: jobUpdated }]);
    const out = (await run("jobs.update", { ...auth, id: J, title: "Principal Compiler Engineer", fetch: impl })) as {
      job: { title: string };
    };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([`PATCH /jobs/${J}`]);
    expect(out.job.title).toBe("Principal Compiler Engineer");
  });

  test("jobs.note.update reconciles via jobs.note.get", async () => {
    const { calls, impl } = stub([{ body: { content: "x" } }, { body: jobNote }]);
    const out = (await run("jobs.note.update", { ...auth, id: J, content: "x", fetch: impl })) as { content: string };
    expect(calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([`PUT /jobs/${J}/note`, `GET /jobs/${J}/note`]);
    expect(out.content).toBe(jobNote.content);
  });

  test("creates and deletes make exactly one call (no observe)", async () => {
    for (const [action, input, reply] of [
      ["jobs.create", { ...auth, ...createInput }, { body: jobCreated, status: 201 }],
      ["jobs.hiring_team.add", { ...auth, id: J, userId: U2, role: "RECRUITER" }, { body: memberAdded }],
      ["jobs.hiring_team.remove", { ...auth, id: J, userId: U2 }, { body: "", status: 204 }],
      ["jobs.publish", { ...auth, id: J }, { body: "", status: 204 }],
      ["jobs.unpublish", { ...auth, id: J }, { body: "", status: 204 }],
    ] as Array<[string, Record<string, unknown>, Reply]>) {
      const s = stub([reply]);
      await run(action, { ...input, fetch: s.impl });
      expect({ action, calls: s.calls.length }).toEqual({ action, calls: 1 });
    }
  });
});

describe("SmartRecruiters id helpers end in the shared dot-segment check", () => {
  test("every prefixed-id helper rejects dot segments, raw or prefixed", () => {
    const cases: Array<[(v: unknown, f?: string) => string, string]> = [
      [jobIdSegment, "sr-job:"],
      [candidateIdSegment, "sr-candidate:"],
      [userIdSegment, "sr-user:"],
    ];
    for (const [helper, prefix] of cases) {
      for (const bad of [".", "..", "...", `${prefix}.`, `${prefix}..`, ` ${prefix}.. `]) {
        expect(() => helper(bad, "id")).toThrow("must not be a dot segment");
      }
      expect(() => stripPrefixedId(`${prefix}..`, "id", [prefix])).toThrow("must not be a dot segment");
      expect(helper(`${prefix}a.b`, "id")).toBe("a.b");
    }
  });
});
