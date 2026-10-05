import { describe, expect, test } from "bun:test";
import {
  executeCandidatesMerge,
  executeCandidatesDelete,
  executeApplicationsDelete,
  executeAttachmentsList,
  executeAttachmentsCreate,
  executeAttachmentsDelete,
  executeCandidateEducationsList,
  executeCandidateEducationsCreate,
  executeCandidateEducationsDelete,
  executeCandidateEmploymentsList,
  executeCandidateEmploymentsCreate,
  executeCandidateEmploymentsDelete,
  executeCandidateTagsCreate,
  executeCandidateTagsDelete,
  executeRejectionDetailsUpdate,
} from "../src/g2";
import { clearGreenhouseTokenCache } from "../src/http";
import manifest from "../manifest.json";
import candidateMerged from "../fixtures/candidate_merged.json";
import candidateDeleted from "../fixtures/candidate_deleted.json";
import attachmentsList from "../fixtures/attachments_list.json";
import attachmentCreated from "../fixtures/attachment_created.json";
import educationsList from "../fixtures/candidate_educations_list.json";
import educationCreated from "../fixtures/candidate_education_created.json";
import employmentsList from "../fixtures/candidate_employments_list.json";
import employmentCreated from "../fixtures/candidate_employment_created.json";
import tagCreated from "../fixtures/candidate_tag_created.json";
import rejectionDetailUpdated from "../fixtures/rejection_detail_updated.json";

const auth = { clientId: "fixture-client", clientSecret: "fixture-secret" };

function isToken(url: string) {
  return String(url).includes("auth.greenhouse.io/token");
}

function harvestCalls(calls: Array<{ url: string; init?: RequestInit }>) {
  return calls.filter((c) => c.url.includes("harvest.greenhouse.io"));
}

function stub(body: string, status = 200, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
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
    return Promise.resolve(
      new Response(body, { status, headers: { "content-type": "application/json", ...headers } }),
    );
  };
  return { calls, impl };
}

function noNetwork() {
  return async () => {
    throw new Error("network must not be called");
  };
}

function first(calls: Array<{ url: string; init?: RequestInit }>) {
  const call = harvestCalls(calls)[0]!;
  return {
    url: new URL(call.url),
    method: call.init?.method,
    body: call.init?.body ? JSON.parse(String(call.init.body)) : undefined,
    auth: (call.init?.headers as Record<string, string> | undefined)?.Authorization,
  };
}

describe("Greenhouse G2 candidates.merge", () => {
  test("POSTs /merge with secondary_candidate_id and passes primary through", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(candidateMerged));
    const result = await executeCandidatesMerge({ ...auth, id: "1", secondaryCandidateId: "2", fetch: impl });
    expect(result.id).toBe(1);
    const call = first(calls);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/v3/candidates/1/merge");
    expect(call.body).toEqual({ secondary_candidate_id: 2 });
    expect(call.auth).toBe("Bearer tok");
  });

  test("rejects self-merge before network", async () => {
    await expect(
      executeCandidatesMerge({ ...auth, id: "5", secondaryCandidateId: 5, fetch: noNetwork() as any }),
    ).rejects.toThrow(/differ/);
  });
});

describe("Greenhouse G2 deletes", () => {
  const cases = [
    [executeCandidatesDelete, "/v3/candidates/11"],
    [executeApplicationsDelete, "/v3/applications/11"],
    [executeAttachmentsDelete, "/v3/attachments/11"],
    [executeCandidateEducationsDelete, "/v3/candidate_educations/11"],
    [executeCandidateEmploymentsDelete, "/v3/candidate_employments/11"],
    [executeCandidateTagsDelete, "/v3/candidate_tags/11"],
  ] as const;

  test("each DELETEs /v3/{res}/{id} and returns { ok: true }", async () => {
    for (const [fn, path] of cases) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stub(JSON.stringify(candidateDeleted));
      const result = await fn({ ...auth, id: "11", fetch: impl });
      expect(result).toEqual({ ok: true });
      const call = first(calls);
      expect(call.method).toBe("DELETE");
      expect(call.url.pathname).toBe(path);
    }
  });

  test("DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    for (const [fn] of cases) {
      clearGreenhouseTokenCache();
      const { impl } = stub(JSON.stringify({ errors: [{ message: "Not Found" }] }), 404);
      let caught: any;
      try {
        await fn({ ...auth, id: "404404", fetch: impl });
      } catch (err) {
        caught = err;
      }
      expect(caught?.code).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(String(caught?.message)).toContain("404");
    }
  });

  test("rejects unsafe path ids", async () => {
    await expect(
      executeCandidatesDelete({ ...auth, id: "../users", fetch: noNetwork() as any }),
    ).rejects.toThrow();
  });
});

describe("Greenhouse G2 lists", () => {
  test("attachments / educations / employments map filters and cursor", async () => {
    for (const [fn, fixture, path, key] of [
      [executeAttachmentsList, attachmentsList, "/v3/attachments", "attachments"],
      [executeCandidateEducationsList, educationsList, "/v3/candidate_educations", "candidateEducations"],
      [executeCandidateEmploymentsList, employmentsList, "/v3/candidate_employments", "candidateEmployments"],
    ] as const) {
      clearGreenhouseTokenCache();
      const { calls, impl } = stub(JSON.stringify(fixture), 200, {
        link: '<https://harvest.greenhouse.io/v3/x?cursor=NEXT123&per_page=2>; rel="next"',
      });
      const result = (await (fn as any)({
        ...auth,
        candidateIds: [1, 2],
        latest: key === "attachments" ? undefined : true,
        applicationIds: key === "attachments" ? "7,8" : undefined,
        type: key === "attachments" ? "resume" : undefined,
        ids: [3],
        perPage: 2,
        cursor: "CUR",
        fetch: impl,
      })) as any;
      expect(result[key]).toHaveLength(1);
      expect(result.nextCursor).toBe("NEXT123");
      const { url, method } = first(calls);
      expect(method).toBe("GET");
      expect(url.pathname).toBe(path);
      expect(url.searchParams.get("candidate_ids")).toBe("1,2");
      expect(url.searchParams.get("ids")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("2");
      expect(url.searchParams.get("cursor")).toBe("CUR");
      if (key === "attachments") {
        expect(url.searchParams.get("application_ids")).toBe("7,8");
        expect(url.searchParams.get("type")).toBe("resume");
      } else {
        expect(url.searchParams.get("latest")).toBe("true");
      }
    }
  });

  test("attachments.list rejects unknown type", async () => {
    await expect(
      executeAttachmentsList({ ...auth, type: "photo", fetch: noNetwork() as any }),
    ).rejects.toThrow(/type must be one of/);
  });
});

describe("Greenhouse G2 attachments.create", () => {
  test("JSON body with base64 content + visibility; passes 201 through", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(attachmentCreated), 201);
    const result = await executeAttachmentsCreate({
      ...auth,
      applicationId: "1",
      filename: "test_resume.pdf",
      type: "resume",
      content: "JVBERi0xLjQK",
      visibility: "admin_only",
      fetch: impl,
    });
    expect(result.id).toBe(1);
    const harvest = harvestCalls(calls)[0]!;
    expect((harvest.init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    const call = first(calls);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/v3/attachments");
    expect(call.body).toEqual({
      application_id: 1,
      filename: "test_resume.pdf",
      type: "resume",
      content: "JVBERi0xLjQK",
      visibility: "admin_only",
    });
  });

  test("url variant", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(attachmentCreated), 201);
    await executeAttachmentsCreate({
      ...auth,
      applicationId: 1,
      filename: "cv.pdf",
      type: "cover_letter",
      url: "https://files.example.com/cv.pdf",
      fetch: impl,
    });
    expect(first(calls).body).toEqual({
      application_id: 1,
      filename: "cv.pdf",
      type: "cover_letter",
      url: "https://files.example.com/cv.pdf",
    });
  });

  test("exactly one of content|url, valid type and visibility — before network", async () => {
    const base = { ...auth, applicationId: 1, filename: "a.pdf", type: "resume", fetch: noNetwork() as any };
    await expect(executeAttachmentsCreate({ ...base })).rejects.toThrow(/exactly one/);
    await expect(
      executeAttachmentsCreate({ ...base, content: "QQ==", url: "https://x.example/a.pdf" }),
    ).rejects.toThrow(/exactly one/);
    await expect(executeAttachmentsCreate({ ...base, type: "photo", content: "QQ==" })).rejects.toThrow(/type/);
    await expect(
      executeAttachmentsCreate({ ...base, content: "QQ==", visibility: "everyone" }),
    ).rejects.toThrow(/visibility/);
  });
});

describe("Greenhouse G2 candidate_educations.create", () => {
  test("date form maps to start_date/end_date + option ids", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(educationCreated), 201);
    const result = await executeCandidateEducationsCreate({
      ...auth,
      candidateId: "1",
      schoolNameCustomFieldOptionId: 10,
      degreeCustomFieldOptionId: "11",
      disciplineCustomFieldOptionId: 12,
      startDate: "2014-01-01",
      endDate: "2014-12-31",
      fetch: impl,
    });
    expect(result.id).toBe(1);
    expect(first(calls).url.pathname).toBe("/v3/candidate_educations");
    expect(first(calls).body).toEqual({
      candidate_id: 1,
      school_name_custom_field_option_id: 10,
      degree_custom_field_option_id: 11,
      discipline_custom_field_option_id: 12,
      start_date: "2014-01-01",
      end_date: "2014-12-31",
    });
  });

  test("month/year form; mixing per side is allowed across sides", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(educationCreated), 201);
    await executeCandidateEducationsCreate({
      ...auth,
      candidateId: 1,
      startDateMonth: 1,
      startDateYear: 2014,
      endDate: "2014-12-31",
      fetch: impl,
    });
    expect(first(calls).body).toEqual({
      candidate_id: 1,
      start_date_month: 1,
      start_date_year: 2014,
      end_date: "2014-12-31",
    });
  });

  test("rejects date + month/year on the same side and out-of-range values before network", async () => {
    const base = { ...auth, candidateId: 1, fetch: noNetwork() as any };
    await expect(
      executeCandidateEducationsCreate({ ...base, startDate: "2014-01-01", startDateYear: 2014 }),
    ).rejects.toThrow(/startDate/);
    await expect(
      executeCandidateEducationsCreate({ ...base, endDate: "2014-12-31", endDateMonth: 12 }),
    ).rejects.toThrow(/endDate/);
    await expect(executeCandidateEducationsCreate({ ...base, startDateMonth: 13 })).rejects.toThrow(/1 and 12/);
    await expect(executeCandidateEducationsCreate({ ...base, endDateYear: 1800 })).rejects.toThrow(/1900/);
    await expect(
      executeCandidateEducationsCreate({ ...auth, candidateId: undefined as any, fetch: noNetwork() as any }),
    ).rejects.toThrow(/candidateId/);
  });
});

describe("Greenhouse G2 employments / tags / rejection details", () => {
  test("candidate_employments.create maps required fields", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(employmentCreated), 201);
    const result = await executeCandidateEmploymentsCreate({
      ...auth,
      candidateId: 1,
      companyName: "Business Corporation",
      title: "Lead Engineer",
      startDate: "2014-08-03",
      endDate: "2015-08-03",
      fetch: impl,
    });
    expect(result.id).toBe(1);
    expect(first(calls).url.pathname).toBe("/v3/candidate_employments");
    expect(first(calls).body).toEqual({
      candidate_id: 1,
      company_name: "Business Corporation",
      title: "Lead Engineer",
      start_date: "2014-08-03",
      end_date: "2015-08-03",
    });
    await expect(
      executeCandidateEmploymentsCreate({
        ...auth,
        candidateId: 1,
        companyName: "X",
        title: "",
        startDate: "2014-08-03",
        fetch: noNetwork() as any,
      }),
    ).rejects.toThrow(/title/);
  });

  test("candidate_tags.create posts name and passes id through", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(tagCreated), 201);
    const result = await executeCandidateTagsCreate({ ...auth, name: "new_tag", fetch: impl });
    expect(result.id).toBe(1);
    expect(first(calls).url.pathname).toBe("/v3/candidate_tags");
    expect(first(calls).body).toEqual({ name: "new_tag" });
  });

  test("candidate_tags.create duplicate 422 → CONNECTOR_UPSTREAM_ERROR", async () => {
    clearGreenhouseTokenCache();
    const { impl } = stub(JSON.stringify({ errors: [{ message: "Name has already been taken" }] }), 422);
    await expect(executeCandidateTagsCreate({ ...auth, name: "dup", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejection_details.update PATCHes reason + custom_fields array", async () => {
    clearGreenhouseTokenCache();
    const { calls, impl } = stub(JSON.stringify(rejectionDetailUpdated));
    const result = await executeRejectionDetailsUpdate({
      ...auth,
      id: "1",
      rejectionReasonId: "3",
      customFields: [{ name_key: "rejection_q", value: "Too junior" }],
      fetch: impl,
    });
    expect(result.id).toBe(1);
    const call = first(calls);
    expect(call.method).toBe("PATCH");
    expect(call.url.pathname).toBe("/v3/rejection_details/1");
    expect(call.body).toEqual({
      rejection_reason_id: 3,
      custom_fields: [{ name_key: "rejection_q", value: "Too junior" }],
    });
    await expect(
      executeRejectionDetailsUpdate({ ...auth, id: "1", fetch: noNetwork() as any }),
    ).rejects.toThrow(/rejectionReasonId/);
    await expect(
      executeRejectionDetailsUpdate({ ...auth, id: "1", customFields: { a: 1 } as any, fetch: noNetwork() as any }),
    ).rejects.toThrow(/array/);
  });
});

describe("Greenhouse G2 manifest", () => {
  const G2 = {
    "candidates.merge": "destructive",
    "candidates.delete": "destructive",
    "applications.delete": "destructive",
    "attachments.list": "read",
    "attachments.create": "write",
    "attachments.delete": "destructive",
    "candidate_educations.list": "read",
    "candidate_educations.create": "write",
    "candidate_educations.delete": "destructive",
    "candidate_employments.list": "read",
    "candidate_employments.create": "write",
    "candidate_employments.delete": "destructive",
    "candidate_tags.create": "write",
    "candidate_tags.delete": "destructive",
    "rejection_details.update": "write",
  } as const;

  test("15 G2 ops are agent actions with locked sideEffects and no effect keys", () => {
    expect(Object.keys(G2)).toHaveLength(15);
    for (const [id, sideEffect] of Object.entries(G2)) {
      const op = (manifest.operations as Record<string, Record<string, unknown>>)[id]!;
      expect(op).toBeTruthy();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(sideEffect);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
  });

  test("required inputs match v3 schema", () => {
    const ops = manifest.operations as Record<string, { inputSchema: { required: string[] } }>;
    expect(ops["candidates.merge"]!.inputSchema.required).toEqual(["id", "secondaryCandidateId"]);
    expect(ops["attachments.create"]!.inputSchema.required).toEqual(["applicationId", "filename", "type"]);
    expect(ops["candidate_employments.create"]!.inputSchema.required).toEqual([
      "candidateId",
      "companyName",
      "title",
      "startDate",
    ]);
    expect(ops["candidate_educations.create"]!.inputSchema.required).toEqual(["candidateId"]);
    expect(ops["candidate_tags.create"]!.inputSchema.required).toEqual(["name"]);
    expect(ops["rejection_details.update"]!.inputSchema.required).toEqual(["id"]);
  });
});
