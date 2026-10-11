import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import {
  executePanelsList,
  executePanelsGet,
  executePanelsCreate,
  executePanelsUpdate,
  executePanelsDelete,
  executeInterviewsCreate,
  executeInterviewsUpdate,
  executeInterviewsDelete,
  executeRequisitionsGet,
  executeRequisitionsCreate,
  executeRequisitionsUpdate,
  executeRequisitionsDelete,
  executeResumesList,
  executeFilesList,
  executeFilesGet,
} from "../src/sync";
import interviewGetFixture from "../fixtures/interview_get.json";

const OPP = "3410c8b9-5c31-4bab-b7e9-9f710206d647";
const USER = "8d49b010-cc6a-4f40-ace5-e86061c677ed";
const PANEL = "2cdfff3a-2d7e-4fa6-9a9b-25ba25b6a9f8";
const NEW_PANEL = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const INT = "85110ec8-e33a-4997-a798-5affc854b7ce";
const NEW_INT = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const REQ = "782be469-cf46-45bf-80ee-9b5ba1f2049d";
const NEW_REQ = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const FILE = "77470a61-640e-4deb-808c-930e61d15f65";

const G2_OPS = [
  "panels.list",
  "panels.get",
  "panels.create",
  "panels.update",
  "panels.delete",
  "interviews.create",
  "interviews.update",
  "interviews.delete",
  "requisitions.get",
  "requisitions.create",
  "requisitions.update",
  "requisitions.delete",
  "resumes.list",
  "files.list",
  "files.get",
] as const;

const RECONCILE = {
  "panels.update": "panels.get",
  "interviews.update": "interviews.get",
  "requisitions.update": "requisitions.get",
} as const;

const NO_EFFECT = G2_OPS.filter((id) => !(id in RECONCILE));
const READS = [
  "panels.list",
  "panels.get",
  "requisitions.get",
  "resumes.list",
  "files.list",
  "files.get",
] as const;
const CREATES = ["panels.create", "interviews.create", "requisitions.create"] as const;
const DELETES = ["panels.delete", "interviews.delete", "requisitions.delete"] as const;

const INTERVIEWERS = [{ id: USER, email: "stephen@example.com" }];
const INTERVIEW_OBJ = {
  subject: "Technical screen",
  interviewers: INTERVIEWERS,
  date: 1717673157232,
  duration: 60,
  location: "Zoom",
};

type Op = Record<string, unknown> & { request?: { method?: string; path?: string; query?: Record<string, string>; result?: Record<string, string> } };
const ops = manifest.operations as unknown as Record<string, Op>;

function queueFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input as string, init));
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    const status = next.status ?? 200;
    const body = status === 204 || next.body === undefined ? null : JSON.stringify(next.body);
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const eu = { apiKey: "fixturekey", region: "eu" };

const panelPayload = {
  id: PANEL,
  timezone: "America/Los_Angeles",
  interviews: [{ ...INTERVIEW_OBJ, id: INT, panel: PANEL }],
  note: "Onsite day",
  externalUrl: "https://cal.example/panel",
  feedbackReminder: "once",
  applications: ["6ffe4153-60bb-4e30-bfbe-bd9b9775879c"],
  externallyManaged: true,
};

const reqPayload = {
  id: REQ,
  requisitionCode: "ENG-12",
  name: "Staff Engineer",
  headcountTotal: 2,
  status: "open",
  hiringManager: USER,
  department: "Engineering",
};

describe("Lever G2 manifest locks (v0.8.0 / 58)", () => {
  test("version and op count", () => {
    expect(manifest.version).toBe("0.8.0");
    expect(Object.keys(ops)).toHaveLength(58);
    for (const id of G2_OPS) expect(ops[id]).toBeTruthy();
  });

  test("every G2 op is an agent tool (kind action)", () => {
    for (const id of G2_OPS) {
      expect(ops[id].kind).toBe("action");
      expect(ops[id].inputSchema).toBeTruthy();
      expect(ops[id].outputSchema).toBeTruthy();
    }
  });

  test("new reads are action/read", () => {
    for (const id of READS) {
      expect(ops[id].kind).toBe("action");
      expect(ops[id].sideEffect).toBe("read");
    }
  });

  test("sideEffect split: 6 write, 6 read, 3 destructive", () => {
    const counts: Record<string, number> = {};
    for (const id of G2_OPS) counts[String(ops[id].sideEffect)] = (counts[String(ops[id].sideEffect)] ?? 0) + 1;
    expect(counts).toEqual({ write: 6, read: 6, destructive: 3 });
    for (const id of DELETES) expect(ops[id].sideEffect).toBe("destructive");
  });

  test("exactly 3 Reconcile targets (panels/interviews/requisitions update)", () => {
    for (const [id, observe] of Object.entries(RECONCILE)) {
      expect(ops[id].effectPolicy).toBe("Reconcile");
      expect(ops[id].reconcile).toBe(observe);
    }
  });

  test("creates, deletes, reads, and non-reconcile writes omit all three effect keys", () => {
    for (const id of NO_EFFECT) {
      expect(Object.hasOwn(ops[id], "effectPolicy")).toBe(false);
      expect(Object.hasOwn(ops[id], "reconcile")).toBe(false);
      expect(Object.hasOwn(ops[id], "effect")).toBe(false);
    }
  });

  test("creates surface data.id as top-level id", () => {
    for (const id of CREATES) {
      const op = ops[id] as Op;
      expect(op.request?.result?.id).toBe("{{response.data.id}}");
      expect(op.request?.result?.data).toBe("{{response.data}}");
    }
  });

  test("interviews[] / interviewers[] are object arrays", () => {
    const interviewsItems = (ops["panels.create"].inputSchema as { properties: { interviews: { items: { type: string; additionalProperties?: boolean } } } })
      .properties.interviews.items;
    expect(interviewsItems).toEqual({ type: "object", additionalProperties: true });
    const interviewersItems = (ops["interviews.create"].inputSchema as { properties: { interviewers: { items: { type: string; additionalProperties?: boolean } } } })
      .properties.interviewers.items;
    expect(interviewersItems).toEqual({ type: "object", additionalProperties: true });
  });

  test("uploadedAt* wires to uploaded_at_* query", () => {
    expect(ops["resumes.list"].request?.query).toEqual({
      uploaded_at_start: "{{uploadedAtStart}}",
      uploaded_at_end: "{{uploadedAtEnd}}",
    });
    expect(ops["files.list"].request?.query).toEqual({
      uploaded_at_start: "{{uploadedAtStart}}",
      uploaded_at_end: "{{uploadedAtEnd}}",
    });
  });

  test("official Lever v1 paths", () => {
    expect(ops["panels.list"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/panels" });
    expect(ops["panels.get"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/panels/{{panelId}}" });
    expect(ops["panels.create"].request).toMatchObject({ method: "POST", path: "/opportunities/{{opportunityId}}/panels" });
    expect(ops["panels.update"].request).toMatchObject({ method: "PUT", path: "/opportunities/{{opportunityId}}/panels/{{panelId}}" });
    expect(ops["panels.delete"].request).toMatchObject({ method: "DELETE", path: "/opportunities/{{opportunityId}}/panels/{{panelId}}" });
    expect(ops["interviews.create"].request).toMatchObject({ method: "POST", path: "/opportunities/{{opportunityId}}/interviews" });
    expect(ops["interviews.update"].request).toMatchObject({ method: "PUT", path: "/opportunities/{{opportunityId}}/interviews/{{interviewId}}" });
    expect(ops["interviews.delete"].request).toMatchObject({ method: "DELETE", path: "/opportunities/{{opportunityId}}/interviews/{{interviewId}}" });
    expect(ops["requisitions.get"].request).toMatchObject({ method: "GET", path: "/requisitions/{{requisitionId}}" });
    expect(ops["requisitions.create"].request).toMatchObject({ method: "POST", path: "/requisitions" });
    expect(ops["requisitions.update"].request).toMatchObject({ method: "PUT", path: "/requisitions/{{requisitionId}}" });
    expect(ops["requisitions.delete"].request).toMatchObject({ method: "DELETE", path: "/requisitions/{{requisitionId}}" });
    expect(ops["resumes.list"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/resumes" });
    expect(ops["files.list"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/files" });
    expect(ops["files.get"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/files/{{fileId}}" });
  });

  test("every G2 op has a registered EU-aware handler", () => {
    expect(defaultConnectorRegistry.validate()).toEqual([]);
  });
});

describe("Lever G2 handlers route to the region host", () => {
  test("panels.create POSTs to api.eu.lever.co and surfaces id", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { ...panelPayload, id: NEW_PANEL } } }]);
    const result = await executePanelsCreate({
      ...eu,
      opportunityId: OPP,
      performAs: USER,
      timezone: "America/Los_Angeles",
      interviews: [INTERVIEW_OBJ],
      note: "Onsite day",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(calls[0].method).toBe("POST");
    expect(url.hostname).toBe("api.eu.lever.co");
    expect(url.pathname).toBe(`/v1/opportunities/${OPP}/panels`);
    expect(url.searchParams.get("perform_as")).toBe(USER);
    expect(result.id).toBe(NEW_PANEL);
  });

  test("panels.list / panels.get / panels.update / panels.delete", async () => {
    const { calls, impl } = queueFetch([
      { body: { data: [panelPayload], hasNext: false } },
      { body: { data: panelPayload } },
      { body: { data: { ...panelPayload, timezone: "America/New_York" } } },
      { status: 204 },
    ]);
    expect((await executePanelsList({ ...eu, opportunityId: OPP, limit: 5, fetch: impl })).data.data).toEqual([panelPayload]);
    expect((await executePanelsGet({ ...eu, opportunityId: OPP, panelId: PANEL, fetch: impl })).data).toEqual({ data: panelPayload });
    await executePanelsUpdate({
      ...eu,
      opportunityId: OPP,
      panelId: PANEL,
      performAs: USER,
      timezone: "America/New_York",
      interviews: [INTERVIEW_OBJ],
      fetch: impl,
    });
    expect(await executePanelsDelete({ ...eu, opportunityId: OPP, panelId: PANEL, performAs: USER, fetch: impl })).toEqual({
      deleted: true,
      opportunityId: OPP,
      panelId: PANEL,
    });
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "PUT", "DELETE"]);
    expect(calls.every((c) => new URL(c.url).hostname === "api.eu.lever.co")).toBe(true);
  });

  test("panels.delete 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = queueFetch([{ status: 404, body: { code: "ResourceNotFound" } }]);
    await expect(
      executePanelsDelete({ ...eu, opportunityId: OPP, panelId: "missing", performAs: USER, fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("interviews.create / update / delete", async () => {
    const { calls, impl } = queueFetch([
      { status: 201, body: { data: { id: NEW_INT, panel: PANEL, ...INTERVIEW_OBJ } } },
      { body: { data: { id: INT, panel: PANEL, ...INTERVIEW_OBJ, duration: 45 } } },
      { status: 204 },
    ]);
    const created = await executeInterviewsCreate({
      ...eu,
      opportunityId: OPP,
      performAs: USER,
      panel: PANEL,
      interviewers: INTERVIEWERS,
      date: INTERVIEW_OBJ.date,
      duration: 60,
      subject: "Technical screen",
      fetch: impl,
    });
    expect(created.id).toBe(NEW_INT);
    await executeInterviewsUpdate({
      ...eu,
      opportunityId: OPP,
      interviewId: INT,
      performAs: USER,
      panel: PANEL,
      interviewers: INTERVIEWERS,
      date: INTERVIEW_OBJ.date,
      duration: 45,
      fetch: impl,
    });
    expect(await executeInterviewsDelete({ ...eu, opportunityId: OPP, interviewId: INT, performAs: USER, fetch: impl })).toEqual({
      deleted: true,
      opportunityId: OPP,
      interviewId: INT,
    });
    expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ["POST", `/v1/opportunities/${OPP}/interviews`],
      ["PUT", `/v1/opportunities/${OPP}/interviews/${INT}`],
      ["DELETE", `/v1/opportunities/${OPP}/interviews/${INT}`],
    ]);
  });

  test("interviews.delete 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = queueFetch([{ status: 404, body: { code: "ResourceNotFound" } }]);
    await expect(
      executeInterviewsDelete({ ...eu, opportunityId: OPP, interviewId: "missing", performAs: USER, fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("requisitions.get / create / update / delete", async () => {
    const { calls, impl } = queueFetch([
      { body: { data: reqPayload } },
      { status: 201, body: { data: { ...reqPayload, id: NEW_REQ } } },
      { body: { data: { ...reqPayload, name: "Staff Engineer II" } } },
      { status: 204 },
    ]);
    expect((await executeRequisitionsGet({ ...eu, requisitionId: REQ, fetch: impl })).data).toEqual({ data: reqPayload });
    const created = await executeRequisitionsCreate({
      ...eu,
      requisitionCode: "ENG-12",
      name: "Staff Engineer",
      headcountTotal: 2,
      fetch: impl,
    });
    expect(created.id).toBe(NEW_REQ);
    await executeRequisitionsUpdate({
      ...eu,
      requisitionId: REQ,
      requisitionCode: "ENG-12",
      name: "Staff Engineer II",
      headcountTotal: 2,
      status: "open",
      fetch: impl,
    });
    expect(await executeRequisitionsDelete({ ...eu, requisitionId: REQ, fetch: impl })).toEqual({
      deleted: true,
      requisitionId: REQ,
    });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PUT", "DELETE"]);
    expect(new URL(calls[1].url).pathname).toBe("/v1/requisitions");
  });

  test("requisitions.delete 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = queueFetch([{ status: 404, body: { code: "ResourceNotFound" } }]);
    await expect(executeRequisitionsDelete({ ...eu, requisitionId: "missing", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("resumes.list / files.list / files.get wire uploaded_at_* and metadata path", async () => {
    const { calls, impl } = queueFetch([
      { body: { data: [{ id: "resume-1" }], hasNext: false } },
      { body: { data: [{ id: FILE }], hasNext: false } },
      { body: { data: { id: FILE, downloadUrl: "https://api.lever.co/v1/x", name: "resume.pdf" } } },
    ]);
    await executeResumesList({ ...eu, opportunityId: OPP, uploadedAtStart: 1, uploadedAtEnd: 2, fetch: impl });
    await executeFilesList({ ...eu, opportunityId: OPP, fetch: impl });
    const file = await executeFilesGet({ ...eu, opportunityId: OPP, fileId: FILE, fetch: impl });
    expect((file.data as { data: { downloadUrl: string } }).data.downloadUrl).toContain("https://");
    const urls = calls.map((c) => new URL(c.url));
    expect(urls[0].pathname).toBe(`/v1/opportunities/${OPP}/resumes`);
    expect(urls[0].searchParams.get("uploaded_at_start")).toBe("1");
    expect(urls[0].searchParams.get("uploaded_at_end")).toBe("2");
    expect(urls[1].pathname).toBe(`/v1/opportunities/${OPP}/files`);
    expect(urls[2].pathname).toBe(`/v1/opportunities/${OPP}/files/${FILE}`);
    expect(urls.every((u) => u.hostname === "api.eu.lever.co")).toBe(true);
  });
});

describe("Lever G2 through the runner registry (EffectPolicy Reconcile)", () => {
  test("panels.update Reconcile → panels.get (write then observe)", async () => {
    const updated = { data: { ...panelPayload, timezone: "America/New_York" } };
    const observed = { data: { ...panelPayload, timezone: "America/New_York", note: "Onsite day" } };
    const { calls, impl } = queueFetch([{ body: updated }, { body: observed }]);
    const result = defaultConnectorRegistry.executeAction("lever", "panels.update", {
      ...eu,
      opportunityId: OPP,
      panelId: PANEL,
      performAs: USER,
      timezone: "America/New_York",
      interviews: [INTERVIEW_OBJ],
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = (await Promise.resolve(result.output)) as { data: { data: { timezone: string } } };
    expect(output.data.data.timezone).toBe("America/New_York");
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET"]);
    expect(new URL(calls[0].url).pathname).toBe(`/v1/opportunities/${OPP}/panels/${PANEL}`);
    expect(new URL(calls[1].url).pathname).toBe(`/v1/opportunities/${OPP}/panels/${PANEL}`);
  });

  test("interviews.update Reconcile → tip interviews.get (write then observe)", async () => {
    const { calls, impl } = queueFetch([
      { body: { data: { id: INT, panel: PANEL, ...INTERVIEW_OBJ, duration: 45 } } },
      { body: interviewGetFixture },
    ]);
    const result = defaultConnectorRegistry.executeAction("lever", "interviews.update", {
      ...eu,
      opportunityId: OPP,
      interviewId: INT,
      performAs: USER,
      panel: PANEL,
      interviewers: INTERVIEWERS,
      date: INTERVIEW_OBJ.date,
      duration: 45,
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = (await Promise.resolve(result.output)) as { interview: { id: string } };
    expect(output.interview.id).toBeTruthy();
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET"]);
    expect(new URL(calls[1].url).pathname).toBe(`/v1/opportunities/${OPP}/interviews/${INT}`);
  });

  test("requisitions.update Reconcile → requisitions.get (write then observe)", async () => {
    const updated = { data: { ...reqPayload, name: "Staff Engineer II" } };
    const observed = { data: { ...reqPayload, name: "Staff Engineer II", headcountTotal: 3 } };
    const { calls, impl } = queueFetch([{ body: updated }, { body: observed }]);
    const result = defaultConnectorRegistry.executeAction("lever", "requisitions.update", {
      ...eu,
      requisitionId: REQ,
      requisitionCode: "ENG-12",
      name: "Staff Engineer II",
      headcountTotal: 3,
      status: "open",
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = (await Promise.resolve(result.output)) as { data: { data: { name: string } } };
    expect(output.data.data.name).toBe("Staff Engineer II");
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET"]);
    expect(new URL(calls[1].url).pathname).toBe(`/v1/requisitions/${REQ}`);
  });

  test("panels.create returns { id, data } with a single POST (no observe)", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { ...panelPayload, id: NEW_PANEL } } }]);
    const result = defaultConnectorRegistry.executeAction("lever", "panels.create", {
      ...eu,
      opportunityId: OPP,
      performAs: USER,
      timezone: "America/Los_Angeles",
      interviews: [INTERVIEW_OBJ],
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = (await Promise.resolve(result.output)) as { id: string };
    expect(output.id).toBe(NEW_PANEL);
    expect(calls).toHaveLength(1);
  });
});
