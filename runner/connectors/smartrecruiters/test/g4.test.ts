import { describe, expect, test } from "bun:test";
import {
  executeDepartmentsList,
  executeDepartmentsGet,
  executeHiringProcessesList,
  executeHiringProcessesGet,
  executeRejectionReasonsList,
  executeWithdrawalReasonsList,
  executeSourcesTypesList,
  executeSourcesValuesList,
  executeCandidatePropertiesList,
  executeJobPropertiesList,
  executeJobPropertiesValuesList,
  executeOfferPropertiesList,
  executeCompanyGet,
  executePostingsDepartmentsList,
} from "../src/g4";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import departmentsList from "../fixtures/departments_list.json";
import departmentGet from "../fixtures/department_get.json";
import hiringProcessesList from "../fixtures/hiring_processes_list.json";
import hiringProcessGet from "../fixtures/hiring_process_get.json";
import rejectionReasons from "../fixtures/rejection_reasons.json";
import withdrawalReasons from "../fixtures/withdrawal_reasons.json";
import sourceTypes from "../fixtures/source_types.json";
import sourceValues from "../fixtures/source_values.json";
import candidateProperties from "../fixtures/candidate_properties.json";
import jobProperties from "../fixtures/job_properties.json";
import jobPropertyValuesPage1 from "../fixtures/job_property_values_page1.json";
import jobPropertyValuesPage2 from "../fixtures/job_property_values_page2.json";
import offerProperties from "../fixtures/offer_properties.json";
import companyConfiguration from "../fixtures/company_configuration.json";
import postingDepartments from "../fixtures/posting_departments.json";

const auth = { apiKey: "fixture-smart-token" };
const DEPT = "5f0c7e2ab1cd2e0001d63b01";

type Reply = { body: unknown; status?: number; headers?: Record<string, string> };

function stub(replies: Reply[]) {
  const calls: Array<{ method: string; url: URL; headers: Headers }> = [];
  let i = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    calls.push({ method: req.method, url: new URL(req.url), headers: req.headers });
    const r = replies[Math.min(i, replies.length - 1)]!;
    i += 1;
    const body = r.body === "" || r.body == null ? null : typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status ?? 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function expectGet(call: { method: string; url: URL; headers: Headers }, path: string) {
  expect(call.method).toBe("GET");
  expect(call.url.hostname).toBe("api.smartrecruiters.com");
  expect(call.url.pathname).toBe(path);
  expect(call.headers.get("x-smarttoken")).toBe("fixture-smart-token");
}

describe("SmartRecruiters G4 departments / hiring processes", () => {
  test("departments.list maps Department rows", async () => {
    const { calls, impl } = stub([{ body: departmentsList }]);
    const out = await executeDepartmentsList({ ...auth, fetch: impl });
    expectGet(calls[0]!, "/configuration/departments");
    expect(calls[0]!.url.search).toBe("");
    expect(out.total).toBe(2);
    expect(out.departments[0]).toEqual({ id: DEPT, label: "Engineering", description: "Product and platform engineering", archived: false });
    expect(out.departments[1]).toEqual({ id: "5f0c7e2ab1cd2e0001d63b02", label: "Talent", description: null, archived: true });
  });

  test("departments.get fetches by id and rejects unsafe ids before any request", async () => {
    const { calls, impl } = stub([{ body: departmentGet }]);
    const out = await executeDepartmentsGet({ ...auth, id: DEPT, fetch: impl });
    expectGet(calls[0]!, `/configuration/departments/${DEPT}`);
    expect(out.department?.label).toBe("Engineering");
    for (const bad of ["", "../x", "a/b", "sr-job:x"]) {
      const s = stub([{ body: departmentGet }]);
      await expect(executeDepartmentsGet({ ...auth, id: bad, fetch: s.impl })).rejects.toThrow(/required|letters, digits/);
      expect(s.calls).toHaveLength(0);
    }
  });

  test("departments.get 404 is CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = stub([{ body: { message: "not found" }, status: 404 }]);
    await expect(executeDepartmentsGet({ ...auth, id: DEPT, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("hiring_processes.list / get map sub-statuses", async () => {
    const list = stub([{ body: hiringProcessesList }]);
    const listed = await executeHiringProcessesList({ ...auth, fetch: list.impl });
    expectGet(list.calls[0]!, "/configuration/hiring-processes");
    expect(listed).toEqual({
      hiringProcesses: [
        { id: "hp-default", name: "Default hiring process", active: true, subStatuses: { IN_REVIEW: ["Phone screen"], INTERVIEW: ["Technical", "Onsite"], OFFERED: ["Verbal"] } },
      ],
      total: 1,
    });
    const get = stub([{ body: hiringProcessGet }]);
    const got = await executeHiringProcessesGet({ ...auth, id: "hp-default", fetch: get.impl });
    expectGet(get.calls[0]!, "/configuration/hiring-processes/hp-default");
    expect(got.hiringProcess?.name).toBe("Default hiring process");
    const bad = stub([{ body: hiringProcessGet }]);
    await expect(executeHiringProcessesGet({ ...auth, id: "../x", fetch: bad.impl })).rejects.toThrow("letters, digits");
    expect(bad.calls).toHaveLength(0);
  });
});

describe("SmartRecruiters G4 reasons / sources", () => {
  test("rejection_reasons.list and withdrawal_reasons.list", async () => {
    const r = stub([{ body: rejectionReasons }]);
    expect(await executeRejectionReasonsList({ ...auth, fetch: r.impl })).toEqual({
      reasons: [
        { id: "rr-skills", label: "Skills mismatch" },
        { id: "rr-position-filled", label: "Position filled" },
      ],
      total: 2,
    });
    expectGet(r.calls[0]!, "/configuration/rejection-reasons");
    const w = stub([{ body: withdrawalReasons }]);
    expect(await executeWithdrawalReasonsList({ ...auth, fetch: w.impl })).toEqual({
      reasons: [{ id: "wr-other-offer", label: "Accepted another offer" }],
      total: 1,
    });
    expectGet(w.calls[0]!, "/configuration/withdrawal-reasons");
  });

  test("sources.types.list flattens subtypes", async () => {
    const { calls, impl } = stub([{ body: sourceTypes }]);
    expect(await executeSourcesTypesList({ ...auth, fetch: impl })).toEqual({
      sourceTypes: [{ id: "JOB_BOARD", label: "Job board", subtypes: ["PAID", "FREE"] }],
      total: 1,
    });
    expectGet(calls[0]!, "/configuration/sources");
  });

  test("sources.values.list pages by limit/offset (no pageId upstream)", async () => {
    const { calls, impl } = stub([{ body: sourceValues }]);
    const out = await executeSourcesValuesList({ ...auth, sourceType: "JOB_BOARD", sourceSubType: "PAID", limit: 2, offset: 0, fetch: impl });
    expectGet(calls[0]!, "/configuration/sources/JOB_BOARD/values");
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ sourceSubType: "PAID", limit: "2", offset: "0" });
    expect(out.total).toBe(120);
    expect(out.limit).toBe(2);
    expect(out.offset).toBe(0);
    expect(out.sources[0]).toEqual({ id: "linkedin", label: "LinkedIn", sourceIdentifier: "0a2f6c1e-3b4d-4e5f-8a9b-0c1d2e3f4a5b", sourceSubType: "PAID" });

    const bare = stub([{ body: sourceValues }]);
    await executeSourcesValuesList({ ...auth, sourceType: "JOB_BOARD", fetch: bare.impl });
    expect(bare.calls[0]!.url.search).toBe("");
    await expect(executeSourcesValuesList({ ...auth, sourceType: "JOB_BOARD", limit: 101, fetch: bare.impl })).rejects.toThrow("limit");
    await expect(executeSourcesValuesList({ ...auth, sourceType: "JOB_BOARD", offset: -1, fetch: bare.impl })).rejects.toThrow("offset");
    const bad = stub([{ body: sourceValues }]);
    await expect(executeSourcesValuesList({ ...auth, sourceType: "a/b", fetch: bad.impl })).rejects.toThrow("letters, digits");
    expect(bad.calls).toHaveLength(0);
  });
});

describe("SmartRecruiters G4 property definitions / company", () => {
  test("candidate_properties.list", async () => {
    const { calls, impl } = stub([{ body: candidateProperties }]);
    expect(await executeCandidatePropertiesList({ ...auth, fetch: impl })).toEqual({
      properties: [{ id: "cp-notice", key: "noticePeriod", label: "Notice period", type: "SINGLE_SELECT", availableTo: "ALL", contexts: ["PROFILE", "HIRE_FORM"] }],
      total: 1,
    });
    expectGet(calls[0]!, "/configuration/candidate-properties");
  });

  test("job_properties.list", async () => {
    const { calls, impl } = stub([{ body: jobProperties }]);
    expect(await executeJobPropertiesList({ ...auth, fetch: impl })).toEqual({
      properties: [{ id: "jp-cost-center", key: "costCenter", label: "Cost center", category: "job", active: true, visible: true, required: false }],
      total: 1,
    });
    expectGet(calls[0]!, "/configuration/job-properties");
  });

  test("job_properties.values.list surfaces body nextPageId, passes pageId/pageSize, null on last page", async () => {
    const p1 = stub([{ body: jobPropertyValuesPage1 }]);
    const first = await executeJobPropertiesValuesList({ ...auth, id: "costCenter", pageSize: 2, fetch: p1.impl });
    expectGet(p1.calls[0]!, "/configuration/job-properties/costCenter/values");
    expect(Object.fromEntries(p1.calls[0]!.url.searchParams)).toEqual({ pageSize: "2" });
    expect(first.nextPageId).toBe("Y2MtNDEw");
    expect(first.values[0]).toEqual({ id: "cc-400", label: "Platform", archived: false, externalCode: "SF-400" });

    const p2 = stub([{ body: jobPropertyValuesPage2 }]);
    const second = await executeJobPropertiesValuesList({ ...auth, id: "costCenter", pageId: first.nextPageId!, fetch: p2.impl });
    expect(p2.calls[0]!.url.searchParams.get("pageId")).toBe("Y2MtNDEw");
    expect(second.nextPageId).toBeNull();
    expect(second.total).toBe(3);

    for (const bad of ["", "has space", "x".repeat(2049)]) {
      const s = stub([{ body: jobPropertyValuesPage1 }]);
      await expect(executeJobPropertiesValuesList({ ...auth, id: "costCenter", pageId: bad, fetch: s.impl })).rejects.toThrow("pageId");
      expect(s.calls).toHaveLength(0);
    }
    await expect(executeJobPropertiesValuesList({ ...auth, id: "costCenter", pageSize: 0, fetch: p2.impl })).rejects.toThrow("pageSize");
  });

  test("offer_properties.list keeps categories", async () => {
    const { calls, impl } = stub([{ body: offerProperties }]);
    expect(await executeOfferPropertiesList({ ...auth, fetch: impl })).toEqual({
      categories: [
        {
          id: "compensation",
          properties: [
            { key: "baseSalary", label: "Base salary", required: true, type: "CURRENCY" },
            { key: "startDate", label: "Start date", required: false, type: "DATE" },
          ],
        },
      ],
    });
    expectGet(calls[0]!, "/configuration/offer-properties");
  });

  test("company.get", async () => {
    const { calls, impl } = stub([{ body: companyConfiguration }]);
    expect(await executeCompanyGet({ ...auth, fetch: impl })).toEqual({
      company: {
        identifier: "AcmeGroup",
        name: "Acme Group",
        website: "https://acme.example.com",
        logo: "https://acme.example.com/logo.png",
        industry: "Computer Software",
        location: { city: "San Francisco", region: "California", country: "United States", countryCode: "us" },
      },
    });
    expectGet(calls[0]!, "/configuration/company");
  });
});

describe("SmartRecruiters G4 postings.departments.list (public Posting API)", () => {
  test("GETs /v1/companies/{company}/departments without credentials", async () => {
    const { calls, impl } = stub([{ body: postingDepartments }]);
    const out = await executePostingsDepartmentsList({ company: "AcmeGroup", fetch: impl });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.href).toBe("https://api.smartrecruiters.com/v1/companies/AcmeGroup/departments");
    expect(calls[0]!.headers.get("x-smarttoken")).toBeNull();
    expect(out).toEqual({
      departments: [
        { id: "13167", label: "Engineering", description: "Build the product" },
        { id: "13168", label: "Sales", description: null },
      ],
      total: 2,
    });
    const bad = stub([{ body: postingDepartments }]);
    await expect(executePostingsDepartmentsList({ company: "../x", fetch: bad.impl })).rejects.toThrow();
    expect(bad.calls).toHaveLength(0);
  });
});

describe("SmartRecruiters G4 through the registry (reads, one call each)", () => {
  test("every authenticated G4 op is registered and makes exactly one GET", async () => {
    const cases: Array<[string, Record<string, unknown>, unknown]> = [
      ["departments.list", {}, departmentsList],
      ["departments.get", { id: DEPT }, departmentGet],
      ["hiring_processes.list", {}, hiringProcessesList],
      ["hiring_processes.get", { id: "hp-default" }, hiringProcessGet],
      ["rejection_reasons.list", {}, rejectionReasons],
      ["withdrawal_reasons.list", {}, withdrawalReasons],
      ["sources.types.list", {}, sourceTypes],
      ["sources.values.list", { sourceType: "JOB_BOARD" }, sourceValues],
      ["candidate_properties.list", {}, candidateProperties],
      ["job_properties.list", {}, jobProperties],
      ["job_properties.values.list", { id: "costCenter" }, jobPropertyValuesPage1],
      ["offer_properties.list", {}, offerProperties],
      ["company.get", {}, companyConfiguration],
    ];
    for (const [action, input, body] of cases) {
      const s = stub([{ body }]);
      const result = defaultConnectorRegistry.executeAction("smartrecruiters", action, { ...auth, ...input, fetch: s.impl });
      expect({ action, ok: result.ok }).toEqual({ action, ok: true });
      await (result as { ok: true; output: unknown }).output;
      expect({ action, calls: s.calls.map((c) => c.method) }).toEqual({ action, calls: ["GET"] });
    }
  });
});

describe("SmartRecruiters G4 dot-segment path ids (SEC-PATH-1)", () => {
  type DotCase = [string, (bad: string, impl: typeof fetch) => Promise<unknown>, unknown];
  const DOT_CASES: DotCase[] = [
    ["departments.get id", (b, fetch) => executeDepartmentsGet({ ...auth, id: b, fetch }), departmentGet],
    ["hiring_processes.get id", (b, fetch) => executeHiringProcessesGet({ ...auth, id: b, fetch }), hiringProcessGet],
    ["sources.values.list sourceType", (b, fetch) => executeSourcesValuesList({ ...auth, sourceType: b, fetch }), sourceValues],
    ["job_properties.values.list id", (b, fetch) => executeJobPropertiesValuesList({ ...auth, id: b, fetch }), jobPropertyValuesPage1],
    ["postings.departments.list company", (b, fetch) => executePostingsDepartmentsList({ company: b, fetch }), postingDepartments],
  ];
  for (const [name, runOp, body] of DOT_CASES) {
    test(`${name}: '.', '..', '...' are rejected before any request`, async () => {
      for (const bad of [".", "..", "...", " .. "]) {
        const s = stub([{ body }]);
        await expect(runOp(bad, s.impl)).rejects.toThrow("must not be a dot segment");
        expect(s.calls).toHaveLength(0);
      }
    });
  }
});
