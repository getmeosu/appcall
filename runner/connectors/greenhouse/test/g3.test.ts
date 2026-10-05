import { describe, expect, test } from "bun:test";
import {
  executeJobsCreate,
  executeJobsUpdate,
  executeJobPostsList,
  executeOpeningsList,
  executeOpeningsCreate,
  executeOpeningsUpdate,
  executeJobOwnersList,
  executeJobOwnersCreate,
  executeJobOwnersDelete,
  executeJobHiringManagersList,
  executeJobHiringManagersCreate,
  executeJobHiringManagersDelete,
  executeJobNotesList,
  executeJobNotesCreate,
  executeJobNotesUpdate,
} from "../src/g3";
import { clearGreenhouseTokenCache } from "../src/http";
import manifest from "../manifest.json";
import jobCreated from "../fixtures/job_created.json";
import jobUpdated from "../fixtures/job_updated.json";
import jobPostsList from "../fixtures/job_posts_list.json";
import openingsList from "../fixtures/openings_list.json";
import openingCreated from "../fixtures/opening_created.json";
import openingUpdated from "../fixtures/opening_updated.json";
import jobOwnersList from "../fixtures/job_owners_list.json";
import jobOwnerCreated from "../fixtures/job_owner_created.json";
import jobOwnerDeleted from "../fixtures/job_owner_deleted.json";
import hiringManagersList from "../fixtures/job_hiring_managers_list.json";
import hiringManagerCreated from "../fixtures/job_hiring_manager_created.json";
import jobNotesList from "../fixtures/job_notes_list.json";
import jobNoteCreated from "../fixtures/job_note_created.json";
import jobNoteUpdated from "../fixtures/job_note_updated.json";

/** Auth carries the credential `userId` (OAuth sub) on purpose: it must never become a wire user_id. */
const auth = { clientId: "fixture-client", clientSecret: "fixture-secret", userId: "9999" };

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
  return {
    url: new URL(call.url),
    method: call.init?.method,
    body: call.init?.body ? JSON.parse(String(call.init.body)) : undefined,
  };
}

describe("Greenhouse G3 jobs.create / jobs.update", () => {
  test("create maps template + openings + v3 custom_fields", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(jobCreated), 201);
    const result = await executeJobsCreate({
      ...auth,
      templateJobId: "10",
      numberOfOpenings: 2,
      jobName: "Job Name",
      jobPostName: "Post",
      departmentId: 5,
      officeIds: [1, "2"],
      requisitionId: "req-2",
      notes: "n",
      openingIds: ["op-1"],
      customFields: [{ name_key: "employment_type", value: "Full-time" }],
      fetch: impl,
    });
    expect(result.id).toBe(1);
    const call = first(calls);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/v3/jobs");
    expect(call.body).toEqual({
      template_job_id: 10,
      number_of_openings: 2,
      job_name: "Job Name",
      job_post_name: "Post",
      department_id: 5,
      office_ids: [1, 2],
      requisition_id: "req-2",
      notes: "n",
      opening_ids: ["op-1"],
      custom_fields: [{ name_key: "employment_type", value: "Full-time" }],
    });
  });

  test("create validation before network", async () => {
    const base = { ...auth, templateJobId: 1, fetch: noNet };
    await expect(executeJobsCreate({ ...base, numberOfOpenings: 0 })).rejects.toThrow(/numberOfOpenings/);
    await expect(
      executeJobsCreate({ ...base, numberOfOpenings: 1, openingIds: ["a", "b"] }),
    ).rejects.toThrow(/openingIds/);
    await expect(
      executeJobsCreate({ ...base, numberOfOpenings: 1, customFields: { a: 1 } as any }),
    ).rejects.toThrow(/array/);
    await expect(
      executeJobsCreate({ ...auth, templateJobId: undefined as any, numberOfOpenings: 1, fetch: noNet }),
    ).rejects.toThrow(/templateJobId/);
  });

  test("update PATCHes fields and supports null clears", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(jobUpdated));
    const result = await executeJobsUpdate({
      ...auth,
      id: "1",
      name: "New Name",
      notes: "New Notes",
      requisitionId: null,
      departmentId: null,
      anywhere: true,
      officeIds: [3],
      fetch: impl,
    });
    expect(result.id).toBe(1);
    const call = first(calls);
    expect(call.method).toBe("PATCH");
    expect(call.url.pathname).toBe("/v3/jobs/1");
    expect(call.body).toEqual({
      name: "New Name",
      notes: "New Notes",
      requisition_id: null,
      office_ids: [3],
      department_id: null,
      anywhere: true,
    });
    await expect(executeJobsUpdate({ ...auth, id: "1", fetch: noNet })).rejects.toThrow(/at least one/);
  });
});

describe("Greenhouse G3 lists", () => {
  test("job_posts / openings / job_owners / hiring managers / job_notes", async () => {
    const cases = [
      [executeJobPostsList, jobPostsList, "/v3/job_posts", "jobPosts", { jobIds: [1, 2], jobBoardIds: 3, live: true, featured: false }, { job_ids: "1,2", job_board_ids: "3", live: "true", featured: "false" }],
      [executeOpeningsList, openingsList, "/v3/openings", "openings", { jobIds: "1", closeReasonIds: [4], open: false, openingId: "op-1" }, { job_ids: "1", close_reason_ids: "4", open: "false", opening_id: "op-1" }],
      [executeJobOwnersList, jobOwnersList, "/v3/job_owners", "jobOwners", { jobIds: [1], userIds: [7, 8], type: "recruiter" }, { job_ids: "1", user_ids: "7,8", type: "recruiter" }],
      [executeJobHiringManagersList, hiringManagersList, "/v3/job_hiring_managers", "jobHiringManagers", { jobIds: [1], userIds: 7 }, { job_ids: "1", user_ids: "7" }],
      [executeJobNotesList, jobNotesList, "/v3/job_notes", "jobNotes", { jobIds: [1], visibility: "privately_visible" }, { job_ids: "1", visibility: "privately_visible" }],
    ] as const;
    for (const [fn, fixture, path, key, extra, expected] of cases) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stub(JSON.stringify(fixture), 200, {
        link: '<https://harvest.greenhouse.io/v3/x?cursor=NEXT9&per_page=5>; rel="next"',
      });
      const result = (await (fn as any)({ ...auth, ...extra, ids: [9], perPage: 5, cursor: "C1", fetch: impl })) as any;
      expect(result[key].length).toBeGreaterThan(0);
      expect(result.nextCursor).toBe("NEXT9");
      const { url, method } = first(calls);
      expect(method).toBe("GET");
      expect(url.pathname).toBe(path);
      expect(url.searchParams.get("ids")).toBe("9");
      expect(url.searchParams.get("per_page")).toBe("5");
      expect(url.searchParams.get("cursor")).toBe("C1");
      for (const [k, v] of Object.entries(expected)) expect(url.searchParams.get(k)).toBe(v);
    }
  });

  test("list enum filters rejected before network", async () => {
    await expect(executeJobOwnersList({ ...auth, type: "hiring_manager", fetch: noNet })).rejects.toThrow(/type/);
    await expect(executeJobNotesList({ ...auth, visibility: "publicly_visible", fetch: noNet })).rejects.toThrow(
      /visibility/,
    );
  });
});

describe("Greenhouse G3 openings writes", () => {
  test("create + update", async () => {
    clearGreenhouseTokenCache();
    const created = stub(JSON.stringify(openingCreated), 201);
    const result = await executeOpeningsCreate({
      ...auth,
      jobId: "1",
      openingId: "1234-abc",
      customFields: [{ custom_field_id: 3, value: "x" }],
      fetch: created.impl,
    });
    expect(result.id).toBe(1);
    expect(first(created.calls).url.pathname).toBe("/v3/openings");
    expect(first(created.calls).body).toEqual({
      job_id: 1,
      opening_id: "1234-abc",
      custom_fields: [{ custom_field_id: 3, value: "x" }],
    });

    clearGreenhouseTokenCache();
    const updated = stub(JSON.stringify(openingUpdated));
    await executeOpeningsUpdate({
      ...auth,
      id: "1",
      status: "closed",
      closeReasonId: "2",
      targetStartOn: "2026-11-01",
      fetch: updated.impl,
    });
    const call = first(updated.calls);
    expect(call.method).toBe("PATCH");
    expect(call.url.pathname).toBe("/v3/openings/1");
    expect(call.body).toEqual({ status: "closed", close_reason_id: 2, target_start_on: "2026-11-01" });
  });

  test("update validation before network", async () => {
    await expect(executeOpeningsUpdate({ ...auth, id: "1", status: "filled", fetch: noNet })).rejects.toThrow(
      /status/,
    );
    await expect(executeOpeningsUpdate({ ...auth, id: "1", fetch: noNet })).rejects.toThrow(/at least one/);
    await expect(executeOpeningsCreate({ ...auth, jobId: undefined as any, fetch: noNet })).rejects.toThrow(/jobId/);
  });
});

describe("Greenhouse G3 hiring team (role-specific user ids, never credential userId)", () => {
  test("job_owners.create wires ownerUserId → user_id", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(jobOwnerCreated), 201);
    const result = await executeJobOwnersCreate({
      ...auth,
      jobId: 1,
      ownerUserId: "42",
      type: "recruiter",
      candidateResponsibility: "active",
      fetch: impl,
    });
    expect(result.id).toBe(1);
    expect(first(calls).url.pathname).toBe("/v3/job_owners");
    expect(first(calls).body).toEqual({ job_id: 1, user_id: 42, type: "recruiter", candidate_responsibility: "active" });
  });

  test("job_owners.create validation before network", async () => {
    const base = { ...auth, jobId: 1, ownerUserId: 42, fetch: noNet };
    await expect(executeJobOwnersCreate({ ...base, type: "hiring_manager" })).rejects.toThrow(/type/);
    await expect(executeJobOwnersCreate({ ...base, type: undefined as any })).rejects.toThrow(/type is required/);
    await expect(
      executeJobOwnersCreate({ ...base, type: "recruiter", candidateResponsibility: "some" }),
    ).rejects.toThrow(/candidateResponsibility/);
    await expect(
      executeJobOwnersCreate({ ...auth, jobId: 1, ownerUserId: undefined as any, type: "sourcer", fetch: noNet }),
    ).rejects.toThrow(/ownerUserId/);
  });

  test("job_hiring_managers.create wires hiringManagerUserId → user_id", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(hiringManagerCreated), 201);
    const result = await executeJobHiringManagersCreate({ ...auth, jobId: "1", hiringManagerUserId: 7, fetch: impl });
    expect(result.id).toBe(1);
    expect(first(calls).url.pathname).toBe("/v3/job_hiring_managers");
    expect(first(calls).body).toEqual({ job_id: 1, user_id: 7 });
    await expect(
      executeJobHiringManagersCreate({ ...auth, jobId: 1, hiringManagerUserId: undefined as any, fetch: noNet }),
    ).rejects.toThrow(/hiringManagerUserId/);
  });
});

describe("Greenhouse G3 job notes", () => {
  test("create wires authorUserId → user_id; update patches body/visibility", async () => {
    clearGreenhouseTokenCache();
    const created = stub(JSON.stringify(jobNoteCreated), 201);
    const result = await executeJobNotesCreate({
      ...auth,
      jobId: 1,
      authorUserId: 3,
      body: "ceci n'est pas un travail",
      visibility: "admin_only_visible",
      fetch: created.impl,
    });
    expect(result.id).toBe(1);
    expect(first(created.calls).url.pathname).toBe("/v3/job_notes");
    expect(first(created.calls).body).toEqual({
      job_id: 1,
      user_id: 3,
      body: "ceci n'est pas un travail",
      visibility: "admin_only_visible",
    });

    clearGreenhouseTokenCache();
    const updated = stub(JSON.stringify(jobNoteUpdated));
    await executeJobNotesUpdate({ ...auth, id: "1", visibility: "privately_visible", fetch: updated.impl });
    expect(first(updated.calls).method).toBe("PATCH");
    expect(first(updated.calls).url.pathname).toBe("/v3/job_notes/1");
    expect(first(updated.calls).body).toEqual({ visibility: "privately_visible" });
  });

  test("validation before network", async () => {
    const base = { ...auth, jobId: 1, authorUserId: 3, body: "x", fetch: noNet };
    await expect(executeJobNotesCreate({ ...base, visibility: "public" })).rejects.toThrow(/visibility/);
    await expect(executeJobNotesCreate({ ...base, visibility: undefined as any })).rejects.toThrow(/visibility is required/);
    await expect(executeJobNotesCreate({ ...base, body: "", visibility: "privately_visible" })).rejects.toThrow(/body/);
    await expect(executeJobNotesUpdate({ ...auth, id: "1", fetch: noNet })).rejects.toThrow(/body and\/or visibility/);
  });
});

describe("Greenhouse G3 deletes", () => {
  const cases = [
    [executeJobOwnersDelete, "/v3/job_owners/77"],
    [executeJobHiringManagersDelete, "/v3/job_hiring_managers/77"],
  ] as const;

  test("DELETE returns { ok: true }", async () => {
    for (const [fn, path] of cases) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stub(JSON.stringify(jobOwnerDeleted));
      expect(await fn({ ...auth, id: "77", fetch: impl })).toEqual({ ok: true });
      expect(first(calls).method).toBe("DELETE");
      expect(first(calls).url.pathname).toBe(path);
    }
  });

  test("DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    for (const [fn] of cases) {
      clearGreenhouseTokenCache();
      const { impl } = stub(JSON.stringify({ errors: [{ message: "Not Found" }] }), 404);
      await expect(fn({ ...auth, id: "404404", fetch: impl })).rejects.toMatchObject({
        code: "CONNECTOR_UPSTREAM_ERROR",
      });
    }
  });
});

describe("Greenhouse G3 manifest", () => {
  const G3 = {
    "jobs.create": "write",
    "jobs.update": "write",
    "job_posts.list": "read",
    "openings.list": "read",
    "openings.create": "write",
    "openings.update": "write",
    "job_owners.list": "read",
    "job_owners.create": "write",
    "job_owners.delete": "destructive",
    "job_hiring_managers.list": "read",
    "job_hiring_managers.create": "write",
    "job_hiring_managers.delete": "destructive",
    "job_notes.list": "read",
    "job_notes.create": "write",
    "job_notes.update": "write",
  } as const;

  test("15 G3 ops: agent actions, locked sideEffects, no effect keys", () => {
    expect(Object.keys(G3)).toHaveLength(15);
    for (const [id, sideEffect] of Object.entries(G3)) {
      const op = (manifest.operations as Record<string, Record<string, unknown>>)[id]!;
      expect(op).toBeTruthy();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(sideEffect);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
  });

  test("no op exposes the credential key userId as an input", () => {
    for (const [id, op] of Object.entries(manifest.operations as Record<string, any>)) {
      const props = op.inputSchema?.properties ?? {};
      expect([id, "userId" in props]).toEqual([id, false]);
    }
    const ops = manifest.operations as Record<string, { inputSchema: { required: string[] } }>;
    expect(ops["job_owners.create"]!.inputSchema.required).toEqual(["jobId", "ownerUserId", "type"]);
    expect(ops["job_hiring_managers.create"]!.inputSchema.required).toEqual(["jobId", "hiringManagerUserId"]);
    expect(ops["job_notes.create"]!.inputSchema.required).toEqual(["jobId", "authorUserId", "body", "visibility"]);
    expect(ops["jobs.create"]!.inputSchema.required).toEqual(["templateJobId", "numberOfOpenings"]);
  });
});
