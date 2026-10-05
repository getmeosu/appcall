import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import {
  executeOpportunitiesCreate,
  executeOpportunitiesAddTags,
  executeOpportunitiesRemoveTags,
  executeOpportunitiesAddLinks,
  executeOpportunitiesRemoveLinks,
  executeOpportunitiesAddSources,
  executeOpportunitiesRemoveSources,
  executeNotesCreate,
  executeNotesGet,
  executeNotesUpdate,
  executeNotesDelete,
  executeSourcesList,
  executeTagsList,
  executeStagesGet,
  executeReferralsList,
} from "../src/sync";
import opportunitiesGetFixture from "../fixtures/opportunities_get.json";

const OPP = "3410c8b9-5c31-4bab-b7e9-9f710206d647";
const NEW_OPP = "8c9a4b7e-2f1d-4e6a-9b3c-5d7e8f9a0b1c";
const USER = "8d49b010-cc6a-4f40-ace5-e86061c677ed";
const NOTE = "b1dbbcfe-281c-46a0-8f51-57049158d3f3";

const G1_OPS = [
  "opportunities.create",
  "opportunities.add_tags",
  "opportunities.remove_tags",
  "opportunities.add_links",
  "opportunities.remove_links",
  "opportunities.add_sources",
  "opportunities.remove_sources",
  "notes.create",
  "notes.get",
  "notes.update",
  "notes.delete",
  "sources.list",
  "tags.list",
  "stages.get",
  "referrals.list",
] as const;
const RECONCILE_OPPORTUNITY = [
  "opportunities.add_tags",
  "opportunities.remove_tags",
  "opportunities.add_links",
  "opportunities.remove_links",
  "opportunities.add_sources",
  "opportunities.remove_sources",
];
const NO_EFFECT = [
  "opportunities.create",
  "notes.create",
  "notes.get",
  "notes.update",
  "notes.delete",
  "sources.list",
  "tags.list",
  "stages.get",
  "referrals.list",
];
const READS = ["notes.get", "sources.list", "tags.list", "stages.get", "referrals.list"];

type Op = Record<string, unknown> & { request?: { method?: string; path?: string } };
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

describe("Lever G1 manifest locks (v0.6.0 / 38)", () => {
  test("version and op count", () => {
    expect(manifest.version).toBe("0.6.0");
    expect(Object.keys(ops)).toHaveLength(38);
    for (const id of G1_OPS) expect(ops[id]).toBeTruthy();
  });

  test("every G1 op is an agent tool (kind action) with an input schema", () => {
    for (const id of G1_OPS) {
      expect(ops[id].kind).toBe("action");
      expect(ops[id].inputSchema).toBeTruthy();
      expect(ops[id].outputSchema).toBeTruthy();
    }
  });

  test("new reads are action/read, not sync", () => {
    for (const id of READS) {
      expect(ops[id].kind).toBe("action");
      expect(ops[id].sideEffect).toBe("read");
    }
  });

  test("sideEffect split: 9 write, 5 read, 1 destructive", () => {
    const counts: Record<string, number> = {};
    for (const id of G1_OPS) counts[String(ops[id].sideEffect)] = (counts[String(ops[id].sideEffect)] ?? 0) + 1;
    expect(counts).toEqual({ write: 9, read: 5, destructive: 1 });
    expect(ops["notes.delete"].sideEffect).toBe("destructive");
  });

  test("opportunities.create omits effect keys and surfaces data.id as id", () => {
    const op = ops["opportunities.create"] as Op & { request: { result: Record<string, string>; query: Record<string, string> } };
    expect(Object.hasOwn(op, "effectPolicy")).toBe(false);
    expect(Object.hasOwn(op, "reconcile")).toBe(false);
    expect(Object.hasOwn(op, "effect")).toBe(false);
    expect(op.request.result.id).toBe("{{response.data.id}}");
    expect(op.request.query.perform_as).toBe("{{performAs}}");
    expect((op.inputSchema as { required: string[] }).required).toEqual(["performAs"]);
  });

  test("tag/link/source mutations Reconcile → opportunities.get (tip observe)", () => {
    for (const id of RECONCILE_OPPORTUNITY) {
      expect(ops[id].effectPolicy).toBe("Reconcile");
      expect(ops[id].reconcile).toBe("opportunities.get");
      expect(ops[id].request?.method).toBe("POST");
    }
  });

  test("opportunities.create, notes.* and the dictionary reads omit all three effect keys", () => {
    for (const id of NO_EFFECT) {
      expect(Object.hasOwn(ops[id], "effectPolicy")).toBe(false);
      expect(Object.hasOwn(ops[id], "reconcile")).toBe(false);
      expect(Object.hasOwn(ops[id], "effect")).toBe(false);
    }
  });

  test("official Lever v1 paths", () => {
    expect(ops["opportunities.create"].request).toMatchObject({ method: "POST", path: "/opportunities" });
    expect(ops["opportunities.add_tags"].request?.path).toBe("/opportunities/{{id}}/addTags");
    expect(ops["opportunities.remove_tags"].request?.path).toBe("/opportunities/{{id}}/removeTags");
    expect(ops["opportunities.add_links"].request?.path).toBe("/opportunities/{{id}}/addLinks");
    expect(ops["opportunities.remove_links"].request?.path).toBe("/opportunities/{{id}}/removeLinks");
    expect(ops["opportunities.add_sources"].request?.path).toBe("/opportunities/{{id}}/addSources");
    expect(ops["opportunities.remove_sources"].request?.path).toBe("/opportunities/{{id}}/removeSources");
    expect(ops["notes.create"].request).toMatchObject({ method: "POST", path: "/opportunities/{{opportunityId}}/notes" });
    expect(ops["notes.get"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/notes/{{noteId}}" });
    expect(ops["notes.update"].request).toMatchObject({ method: "PUT", path: "/opportunities/{{opportunityId}}/notes/{{noteId}}" });
    expect(ops["notes.delete"].request).toMatchObject({ method: "DELETE", path: "/opportunities/{{opportunityId}}/notes/{{noteId}}" });
    expect(ops["sources.list"].request).toMatchObject({ method: "GET", path: "/sources" });
    expect(ops["tags.list"].request).toMatchObject({ method: "GET", path: "/tags" });
    expect(ops["stages.get"].request).toMatchObject({ method: "GET", path: "/stages/{{stageId}}" });
    expect(ops["referrals.list"].request).toMatchObject({ method: "GET", path: "/opportunities/{{opportunityId}}/referrals" });
  });

  test("every G1 op has a registered EU-aware handler", () => {
    expect(defaultConnectorRegistry.validate()).toEqual([]);
  });
});

describe("Lever G1 handlers route to the region host", () => {
  test("opportunities.create POSTs to api.eu.lever.co with perform_as and surfaces id", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { id: NEW_OPP, name: "Shane Smith" } } }]);
    const result = await executeOpportunitiesCreate({
      ...eu,
      performAs: USER,
      name: "Shane Smith",
      emails: ["shane@example.com"],
      contactId: "7f23e772-f2cb-4ebb-b33f-54b872999992",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(calls[0].method).toBe("POST");
    expect(url.hostname).toBe("api.eu.lever.co");
    expect(url.pathname).toBe("/v1/opportunities");
    expect(url.searchParams.get("perform_as")).toBe(USER);
    expect(JSON.parse(await calls[0].text())).toEqual({
      name: "Shane Smith",
      emails: ["shane@example.com"],
      contact: "7f23e772-f2cb-4ebb-b33f-54b872999992",
    });
    expect(result.id).toBe(NEW_OPP);
    expect(result.data.name).toBe("Shane Smith");
  });

  test("opportunities.create rejects a response without data.id", async () => {
    const { impl } = queueFetch([{ status: 201, body: { data: { name: "x" } } }]);
    await expect(executeOpportunitiesCreate({ ...eu, performAs: USER, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
  });

  test("opportunities.create requires performAs before fetch", async () => {
    const { calls, impl } = queueFetch([]);
    await expect(executeOpportunitiesCreate({ ...eu, performAs: "", fetch: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  const mutations = [
    ["addTags", executeOpportunitiesAddTags, "tags"],
    ["removeTags", executeOpportunitiesRemoveTags, "tags"],
    ["addLinks", executeOpportunitiesAddLinks, "links"],
    ["removeLinks", executeOpportunitiesRemoveLinks, "links"],
    ["addSources", executeOpportunitiesAddSources, "sources"],
    ["removeSources", executeOpportunitiesRemoveSources, "sources"],
  ] as const;
  for (const [suffix, fn, field] of mutations) {
    test(`${suffix} POSTs { ${field} } to /v1/opportunities/{id}/${suffix}`, async () => {
      const { calls, impl } = queueFetch([{ body: opportunitiesGetFixture }]);
      const result = await fn({ ...eu, id: OPP, [field]: ["value-a"], performAs: USER, fetch: impl });
      const url = new URL(calls[0].url);
      expect(calls[0].method).toBe("POST");
      expect(url.hostname).toBe("api.eu.lever.co");
      expect(url.pathname).toBe(`/v1/opportunities/${OPP}/${suffix}`);
      expect(url.searchParams.get("perform_as")).toBe(USER);
      expect(JSON.parse(await calls[0].text())).toEqual({ [field]: ["value-a"] });
      expect(result.data).toEqual(opportunitiesGetFixture);
    });

    test(`${suffix} rejects an empty ${field} array before fetch`, async () => {
      const { calls, impl } = queueFetch([]);
      await expect(fn({ ...eu, id: OPP, [field]: [], fetch: impl })).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });
  }

  test("notes.create POSTs value with note_id thread query and returns noteId only", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { noteId: "915a6cef" } } }]);
    const result = await executeNotesCreate({
      ...eu,
      opportunityId: OPP,
      value: "Threaded reply",
      secret: false,
      noteId: NOTE,
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.eu.lever.co");
    expect(url.pathname).toBe(`/v1/opportunities/${OPP}/notes`);
    expect(url.searchParams.get("note_id")).toBe(NOTE);
    expect(JSON.parse(await calls[0].text())).toEqual({ value: "Threaded reply", secret: false });
    expect(result).toEqual({ data: { data: { noteId: "915a6cef" } } });
    expect(Object.hasOwn(result, "id")).toBe(false);
  });

  test("notes.get / notes.update / notes.delete hit the note path", async () => {
    const note = { data: { id: NOTE, text: "Note", fields: [] } };
    const { calls, impl } = queueFetch([
      { body: note },
      { body: { data: { noteId: NOTE } } },
      { status: 204 },
    ]);
    expect(await executeNotesGet({ ...eu, opportunityId: OPP, noteId: NOTE, fetch: impl })).toEqual({ data: note });
    expect(
      await executeNotesUpdate({ ...eu, opportunityId: OPP, noteId: NOTE, values: [{ value: "v2" }], fetch: impl }),
    ).toEqual({ data: { data: { noteId: NOTE } } });
    expect(await executeNotesDelete({ ...eu, opportunityId: OPP, noteId: NOTE, fetch: impl })).toEqual({
      deleted: true,
      opportunityId: OPP,
      noteId: NOTE,
    });
    expect(calls.map((c) => c.method)).toEqual(["GET", "PUT", "DELETE"]);
    for (const call of calls) {
      expect(new URL(call.url).hostname).toBe("api.eu.lever.co");
      expect(new URL(call.url).pathname).toBe(`/v1/opportunities/${OPP}/notes/${NOTE}`);
    }
    expect(JSON.parse(await calls[1].text())).toEqual({ values: [{ value: "v2" }] });
  });

  test("notes.delete 404 → CONNECTOR_UPSTREAM_ERROR (not idempotent success)", async () => {
    const { impl } = queueFetch([{ status: 404, body: { code: "ResourceNotFound" } }]);
    await expect(executeNotesDelete({ ...eu, opportunityId: OPP, noteId: "missing", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("path segments reject dot segments and unsafe characters", async () => {
    const { calls, impl } = queueFetch([]);
    await expect(executeNotesGet({ ...eu, opportunityId: "..", noteId: NOTE, fetch: impl })).rejects.toThrow();
    await expect(executeStagesGet({ ...eu, stageId: "a/b", fetch: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("sources.list / tags.list / stages.get / referrals.list", async () => {
    const { calls, impl } = queueFetch([
      { body: { data: [{ text: "Gild", count: 24 }], hasNext: false } },
      { body: { data: [{ text: "Full-time", count: 66 }], hasNext: false } },
      { body: { data: { id: "stage-1", text: "New applicant" } } },
      { body: { data: [{ id: "ref-1", type: "referral" }], hasNext: false } },
    ]);
    expect((await executeSourcesList({ ...eu, limit: 10, offset: "cur", fetch: impl })).data.data).toEqual([
      { text: "Gild", count: 24 },
    ]);
    await executeTagsList({ ...eu, fetch: impl });
    expect((await executeStagesGet({ ...eu, stageId: "stage-1", fetch: impl })).data).toEqual({
      data: { id: "stage-1", text: "New applicant" },
    });
    await executeReferralsList({ ...eu, opportunityId: OPP, limit: 5, fetch: impl });
    const urls = calls.map((c) => new URL(c.url));
    expect(urls.every((u) => u.hostname === "api.eu.lever.co")).toBe(true);
    expect(urls.map((u) => u.pathname)).toEqual([
      "/v1/sources",
      "/v1/tags",
      "/v1/stages/stage-1",
      `/v1/opportunities/${OPP}/referrals`,
    ]);
    expect(urls[0].searchParams.get("limit")).toBe("10");
    expect(urls[0].searchParams.get("offset")).toBe("cur");
    expect(urls[3].searchParams.get("limit")).toBe("5");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("Lever G1 through the runner registry (EffectPolicy)", () => {
  test("opportunities.create returns the primary { id, data } with a single POST on the EU host (no observe)", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { id: NEW_OPP, name: "Shane Smith" } } }]);
    const result = defaultConnectorRegistry.executeAction("lever", "opportunities.create", {
      ...eu,
      performAs: USER,
      name: "Shane Smith",
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = (await Promise.resolve(result.output)) as { id: string; data: { name: string } };
    expect(output.id).toBe(NEW_OPP);
    expect(output.data.name).toBe("Shane Smith");
    expect(calls.map((c) => [c.method, new URL(c.url).hostname, new URL(c.url).pathname])).toEqual([
      ["POST", "api.eu.lever.co", "/v1/opportunities"],
    ]);
  });

  test("add_links Reconcile observes opportunities.get without asserting a links field", async () => {
    const { calls, impl } = queueFetch([{ body: opportunitiesGetFixture }, { body: opportunitiesGetFixture }]);
    const result = defaultConnectorRegistry.executeAction("lever", "opportunities.add_links", {
      ...eu,
      id: OPP,
      links: ["indeed.com/r/Teresa-Kale/1a2b3c"],
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = (await Promise.resolve(result.output)) as { opportunity: Record<string, unknown> };
    expect(output.opportunity.id).toBe(`lev-opportunity:${OPP}`);
    expect(Object.hasOwn(output.opportunity, "links")).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);
  });

  test("notes.create returns the primary noteId envelope (no observe)", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { noteId: "915a6cef" } } }]);
    const result = defaultConnectorRegistry.executeAction("lever", "notes.create", {
      ...eu,
      opportunityId: OPP,
      value: "hello",
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await Promise.resolve(result.output)).toEqual({ data: { data: { noteId: "915a6cef" } } });
    expect(calls).toHaveLength(1);
  });
});
