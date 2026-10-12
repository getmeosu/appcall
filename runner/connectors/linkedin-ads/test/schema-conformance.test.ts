// G1 add-on (a): every op's fixtures/cases output, produced by real registry
// dispatch, must conform to the op's declared outputSchema under the repo's own
// strict validator (runner/bun/src/declarative/strict-schema.ts, which mirrors
// crates/appcall-connectors/src/schema.rs; the repo has no ajv). Input schemas
// carry no unions: no type arrays and no oneOf/anyOf/allOf/not.
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileStrictValidator } from "../../../bun/src/declarative/strict-schema";
import { defaultConnectorRegistry as registry } from "../../../bun/src/registry";
import manifest from "../manifest.json";
import {
  createCampaign,
  deleteCampaign,
  deleteCampaignGroup,
  deleteCreative,
  updateCampaign,
  updateCampaignGroup,
  updateCreative,
} from "../src/g1-actions";

type Exchange = {
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  response: { status: number; headers: Record<string, string>; body: unknown };
};
type Case = { id: string; operation: string; input: Record<string, unknown>; exchanges: Exchange[] };
type Op = { kind: string; inputSchema: unknown; outputSchema?: Record<string, unknown> };

const operations = manifest.operations as unknown as Record<string, Op>;
const casesDir = join(import.meta.dir, "../fixtures/cases");
const cases: Case[] = readdirSync(casesDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")));

function replay(exchanges: Exchange[]) {
  let index = 0;
  return () => {
    const exchange = exchanges[Math.min(index, exchanges.length - 1)]!;
    index += 1;
    const body = exchange.response.body;
    const payload = body === null || body === undefined ? null : JSON.stringify(body);
    return Promise.resolve(new Response(payload, { status: exchange.response.status, headers: exchange.response.headers }));
  };
}

async function run(item: Case): Promise<unknown> {
  const input = { accessToken: "fixture-access-value", ...item.input, fetch: replay(item.exchanges) };
  const kind = operations[item.operation]!.kind;
  const result: any = item.operation === "healthcheck"
    ? registry.healthcheck("linkedin-ads", input)
    : kind === "sync"
      ? registry.executeSync("linkedin-ads", item.operation, input)
      : registry.executeAction("linkedin-ads", item.operation, input);
  expect(result?.ok, `${item.id}: ${JSON.stringify(result)}`).toBe(true);
  return await result.output;
}

describe("output schema conformance (every op, fixture output, real validator)", () => {
  it("covers every manifest op with a declared outputSchema", () => {
    expect(cases.map((item) => item.operation).sort()).toEqual(Object.keys(operations).sort());
    for (const [key, op] of Object.entries(operations)) expect(op.outputSchema?.type, key).toBe("object");
  });

  for (const item of cases) {
    it(`${item.operation} output conforms to its outputSchema`, async () => {
      const output = await run(item);
      const validate = compileStrictValidator(operations[item.operation]!.outputSchema as never, { registry: true });
      expect(() => validate(output), item.id).not.toThrow();
    });
  }

  it("the validator really rejects a non-conforming output", () => {
    const validate = compileStrictValidator(operations["campaign_groups.list"]!.outputSchema as never, { registry: true });
    expect(() => validate({ connector: "linkedin-ads", action: "campaign_groups.list", source: "connector", campaignGroups: [], nextStart: null, count: 0, nextPageToken: 7 })).toThrow();
  });
});

describe("input schemas carry no unions", () => {
  const banned = ["oneOf", "anyOf", "allOf", "not"];
  function walk(node: unknown, path: string, found: string[]): void {
    if (Array.isArray(node)) { node.forEach((item, i) => walk(item, `${path}[${i}]`, found)); return; }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record.type)) found.push(`${path}.type`);
    for (const key of banned) if (key in record) found.push(`${path}.${key}`);
    for (const [key, value] of Object.entries(record)) if (key !== "enum" && key !== "const") walk(value, `${path}.${key}`, found);
  }

  it("has no type arrays or oneOf/anyOf/allOf/not in any op input", () => {
    const found: string[] = [];
    for (const [key, op] of Object.entries(operations)) walk(op.inputSchema, key, found);
    expect(found).toEqual([]);
  });

  it("analytics fields is an array of strings and ad account ids are strings", () => {
    const analytics = (operations["analytics.report.get"]!.inputSchema as any).properties.fields;
    expect(analytics).toMatchObject({ type: "array", items: { type: "string" } });
    for (const key of ["campaigns.get", "ad_accounts.get", "campaign_groups.list", "creatives.list", "campaign_groups.get"]) {
      expect((operations[key]!.inputSchema as any).properties.ad_account_id.type, key).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// LI-G1b (v0.7.1): Reconcile update output schemas, delete output paths,
// typed targetingCriteria input. Same strict validator as above.
// ---------------------------------------------------------------------------

const RUNNER_METADATA = ["connector", "action", "source"] as const;
// PLAT-OUT-1 shape: the same output once the runner stops injecting metadata.
function stripMetadata<T extends Record<string, unknown>>(output: T): Record<string, unknown> {
  const { connector: _c, action: _a, source: _s, ...rest } = output;
  return rest;
}
const byOperation = new Map(cases.map((item) => [item.operation, item]));
const outputValidator = (op: string) => compileStrictValidator(operations[op]!.outputSchema as never, { registry: true });
const ok204 = () => Promise.resolve(new Response(null, { status: 204 }));
const RECONCILE: Array<{ update: string; observe: string; entity: string; direct: (input: Record<string, unknown>) => unknown; input: Record<string, unknown> }> = [
  { update: "campaign_groups.update", observe: "campaign_groups.get", entity: "campaignGroup", direct: updateCampaignGroup as never, input: { accountId: "507404993", campaignGroupId: "614040544", name: "Renamed" } },
  { update: "campaigns.update", observe: "campaigns.get", entity: "campaign", direct: updateCampaign as never, input: { accountId: "507404993", campaignId: "403553896", status: "PAUSED" } },
  { update: "creatives.update", observe: "creatives.get", entity: "creative", direct: updateCreative as never, input: { accountId: "507404993", creativeId: "283910045", intendedStatus: "PAUSED" } },
];

describe("LI-G1b Reconcile updates: observe output and direct output both validate against the update outputSchema", () => {
  for (const { update, observe, entity, direct, input } of RECONCILE) {
    it(`${update} Reconciles on ${observe}`, () => {
      expect(operations[update] as unknown as Record<string, unknown>).toMatchObject({ effectPolicy: "Reconcile", reconcile: observe });
    });

    it(`${observe} fixture output (the raw observe) validates against ${update}'s outputSchema`, async () => {
      const output: any = await run(byOperation.get(observe)!);
      expect(output.action).toBe(observe);
      expect(output[entity]).not.toBeNull();
      expect(() => outputValidator(update)(output)).not.toThrow();
    });

    it(`${update} registry dispatch returns the observe output, which validates`, async () => {
      const output: any = await run(byOperation.get(update)!);
      expect(output.action).toBe(observe);
      expect(output[entity]).not.toBeNull();
      expect(() => outputValidator(update)(output)).not.toThrow();
    });

    it(`${update} direct handler output (204, no body) validates`, async () => {
      const output: any = await direct({ accessToken: "fixture-access-value", ...input, fetch: ok204 });
      expect(output.action).toBe(update);
      expect(output[entity]).toBeNull();
      expect(Array.isArray(output.updated)).toBe(true);
      expect(() => outputValidator(update)(output)).not.toThrow();
    });

    it(`${update} dry run (no token), direct and through the registry, validates`, async () => {
      const directOut: any = await direct({ ...input });
      expect(directOut[entity]).toBeNull();
      expect(() => outputValidator(update)(directOut)).not.toThrow();
      const dispatched: any = registry.executeAction("linkedin-ads", update, { ...input });
      expect(dispatched.ok).toBe(true);
      const reconciled: any = await dispatched.output;
      expect(reconciled.action).toBe(observe);
      expect(Object.hasOwn(reconciled, entity)).toBe(true);
      expect(() => outputValidator(update)(reconciled)).not.toThrow();
    });
  }

  for (const [update, entity] of [["campaign_groups.update", "campaignGroup"], ["campaigns.update", "campaign"]] as const) {
    it(`${update} outputSchema is closed and requires only the returned entity (PLAT-OUT-1: runner metadata optional)`, () => {
      const schema = operations[update]!.outputSchema as Record<string, any>;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual([entity]);
      for (const key of RUNNER_METADATA) expect(schema.properties[key], key).toEqual({ type: "string" });
      const validate = outputValidator(update);
      const good = { connector: "linkedin-ads", action: update, source: "connector", [entity]: null };
      expect(() => validate(good)).not.toThrow();
      expect(() => validate(stripMetadata(good))).not.toThrow();
      expect(() => validate({ ...good, surprise: 1 })).toThrow("surprise");
      const { [entity]: _dropped, ...missing } = good;
      expect(() => validate(missing)).toThrow(entity);
      expect(() => validate({ ...good, action: 7 })).toThrow();
      expect(() => validate({ ...good, [entity]: "not-an-object" })).toThrow();
    });
  }
});

const DELETES = [
  { op: "campaign_groups.delete", id: "campaignGroupId", statusField: "status", handler: deleteCampaignGroup as never as (input: Record<string, unknown>) => unknown, input: { accountId: "507404993", campaignGroupId: "614040544" } },
  { op: "campaigns.delete", id: "campaignId", statusField: "status", handler: deleteCampaign as never as (input: Record<string, unknown>) => unknown, input: { accountId: "507404993", campaignId: "403553896" } },
  { op: "creatives.delete", id: "creativeId", statusField: "intendedStatus", handler: deleteCreative as never as (input: Record<string, unknown>) => unknown, input: { accountId: "507404993", creativeId: "283910045" } },
];

function sequence(replies: Array<{ status: number; body?: unknown }>) {
  let index = 0;
  return () => {
    const reply = replies[Math.min(index, replies.length - 1)]!;
    index += 1;
    return Promise.resolve(new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status, headers: reply.body === undefined ? {} : { "content-type": "application/json" } }));
  };
}

describe("LI-G1b delete outputs: every path validates against the (closed) delete outputSchema", () => {
  for (const { op, id, statusField, handler, input } of DELETES) {
    it(`${op} outputSchema requires the id, keeps previousStatus/method/status optional (absent on a dry run) and is closed`, () => {
      const schema = operations[op]!.outputSchema as Record<string, any>;
      expect(schema.required).toEqual([id]);
      expect(schema.additionalProperties).toBe(false);
      for (const key of RUNNER_METADATA) expect(schema.properties[key], key).toEqual({ type: "string" });
      expect(Object.keys(schema.properties).sort()).toEqual(["action", "connector", id, "method", "previousStatus", "source", "status", "validated"].sort());
      expect(() => outputValidator(op)({ connector: "linkedin-ads", action: op, source: "connector", [id]: "1", extra: true })).toThrow("extra");
    });

    const live: Array<[string, Array<{ status: number; body?: unknown }>, { previousStatus: string | null; method: string; status: string }]> = [
      ["DRAFT -> DELETE", [{ status: 200, body: { [statusField]: "DRAFT" } }, { status: 204 }], { previousStatus: "DRAFT", method: "DELETE", status: "DELETED" }],
      ["ACTIVE -> PENDING_DELETION", [{ status: 200, body: { [statusField]: "ACTIVE" } }, { status: 204 }], { previousStatus: "ACTIVE", method: "PENDING_DELETION", status: "PENDING_DELETION" }],
      ["REMOVED -> NONE", [{ status: 200, body: { [statusField]: "REMOVED" } }], { previousStatus: "REMOVED", method: "NONE", status: "REMOVED" }],
      ["no status -> PENDING_DELETION, previousStatus null", [{ status: 200, body: {} }, { status: 204 }], { previousStatus: null, method: "PENDING_DELETION", status: "PENDING_DELETION" }],
    ];
    for (const [label, replies, expected] of live) {
      it(`${op} live path ${label} returns previousStatus, method and status and validates`, async () => {
        const output: any = await handler({ accessToken: "fixture-access-value", ...input, fetch: sequence(replies) });
        expect(output).toMatchObject({ action: op, ...expected });
        expect(() => outputValidator(op)(output)).not.toThrow();
      });
    }

    it(`${op} dry run (no token, direct and registry) omits previousStatus/method/status and validates`, async () => {
      const directOut: any = await handler({ ...input });
      const dispatched: any = registry.executeAction("linkedin-ads", op, { ...input });
      expect(dispatched.ok).toBe(true);
      for (const output of [directOut, await dispatched.output]) {
        for (const key of ["previousStatus", "method", "status"]) expect(Object.hasOwn(output, key), key).toBe(false);
        expect(output.validated).toBeDefined();
        expect(() => outputValidator(op)(output)).not.toThrow();
      }
    });
  }
});

// Documented payloads, verbatim from Microsoft Learn view=li-lms-2026-09:
// targeting-criteria reference (structure/rules) and create-and-manage-campaigns samples.
const DOC_TARGETING = {
  minimal: { include: { and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] } }, { or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } }] } },
  leadGenWithSegmentsAndExclude: {
    exclude: { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:102095887"] } },
    include: { and: [
      { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] } },
      { or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } },
      { or: { "urn:li:adTargetingFacet:segments": ["urn:li:adSegment:259144"] } },
    ] },
  },
  partialUpdateSample: {
    exclude: { or: { "urn:li:adTargetingFacet:employers": ["urn:li:company:0000", "urn:li:company:1035"], "urn:li:adTargetingFacet:locations": ["urn:li:geo:102095887"] } },
    include: { and: [
      { or: { "urn:li:adTargetingFacet:industries": ["urn:li:industry:8", "urn:li:industry:9"] } },
      { or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278", "urn:li:geo:101174742"] } },
      { or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } },
    ] },
  },
  multiFacetOrAndEmptyExclude: {
    include: { and: [{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"], "urn:li:adTargetingFacet:profileLocations": ["urn:li:geo:101174742"] } }, { or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } }] },
    exclude: {},
  },
};
const LOCALES = { or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } };
const INVALID_TARGETING: Record<string, unknown> = {
  "unknown top-level key": { include: { and: [LOCALES] }, targeting: {} },
  "include without and": { include: { or: LOCALES.or } },
  "empty include.and": { include: { and: [] }, exclude: { or: LOCALES.or } },
  "and clause with an extra key": { include: { and: [{ ...LOCALES, and: [] }] } },
  "and clause with an empty or": { include: { and: [LOCALES, { or: {} }] } },
  "facet values not an array": { include: { and: [LOCALES, { or: { "urn:li:adTargetingFacet:locations": "urn:li:geo:1" } }] } },
  "facet values with a non-string": { include: { and: [LOCALES, { or: { "urn:li:adTargetingFacet:locations": [103644278] } }] } },
  "empty facet value list": { include: { and: [LOCALES, { or: { "urn:li:adTargetingFacet:locations": [] } }] } },
  "exclude with and": { include: { and: [LOCALES] }, exclude: { and: [] } },
};

describe("LI-G1b typed targetingCriteria (campaigns.create / campaigns.update)", () => {
  const schemaOf = (op: string) => (operations[op]!.inputSchema as any).properties.targetingCriteria;
  const createBase = {
    accountId: "507404993", campaignGroup: "614040545", name: "Q1 launch - feed", type: "SPONSORED_UPDATES", costType: "CPM",
    unitCost: { amount: "12.00", currencyCode: "USD" }, locale: { country: "US", language: "en" }, status: "DRAFT",
    offsiteDeliveryEnabled: false, politicalIntent: "NOT_POLITICAL", dailyBudget: { amount: "80.00", currencyCode: "USD" },
  };

  it("is a typed single-type object with the documented top-level keys and cites the docs", () => {
    for (const op of ["campaigns.create", "campaigns.update"]) {
      const schema = schemaOf(op);
      expect(schema).toMatchObject({ type: "object", required: ["include"], additionalProperties: false });
      expect(Object.keys(schema.properties).sort()).toEqual(["exclude", "include"]);
      expect(schema.properties.include.properties.and.items.properties.or.additionalProperties).toMatchObject({ type: "array", items: { type: "string" } });
      expect(schema.properties.exclude.properties.or.additionalProperties).toMatchObject({ type: "array", items: { type: "string" } });
      expect(schema.description).toContain("targeting-criteria?view=li-lms-2026-09");
    }
  });

  for (const [label, payload] of Object.entries(DOC_TARGETING)) {
    it(`accepts the documented payload "${label}" in the schema, the handler and registry dispatch`, async () => {
      for (const op of ["campaigns.create", "campaigns.update"]) expect(() => compileStrictValidator(schemaOf(op))(payload), op).not.toThrow();
      expect(() => createCampaign({ ...createBase, targetingCriteria: payload })).not.toThrow();
      expect(() => updateCampaign({ accountId: "507404993", campaignId: "403553896", targetingCriteria: payload })).not.toThrow();
      const created: any = registry.executeAction("linkedin-ads", "campaigns.create", { ...createBase, targetingCriteria: payload });
      expect(created.ok, JSON.stringify(created)).toBe(true);
      const updated: any = registry.executeAction("linkedin-ads", "campaigns.update", { accountId: "507404993", campaignId: "403553896", targetingCriteria: payload });
      expect(updated.ok, JSON.stringify(updated)).toBe(true);
    });
  }

  it("still accepts the existing fixture payloads (backward compatible)", () => {
    for (const op of ["campaigns.create", "campaigns.update"]) {
      const item = byOperation.get(op)!;
      if (item.input.targetingCriteria !== undefined) expect(() => compileStrictValidator(schemaOf(op))(item.input.targetingCriteria)).not.toThrow();
    }
    const createBody = JSON.parse(byOperation.get("campaigns.create")!.exchanges[0]!.request.body!);
    expect(() => compileStrictValidator(schemaOf("campaigns.create"))(createBody.targetingCriteria)).not.toThrow();
    const observed = (byOperation.get("campaigns.update")!.exchanges[1]!.response.body as any).targetingCriteria;
    expect(() => compileStrictValidator(schemaOf("campaigns.update"))(observed)).not.toThrow();
  });

  for (const [label, payload] of Object.entries(INVALID_TARGETING)) {
    it(`rejects ${label} in the schema, the handler and registry dispatch`, () => {
      for (const op of ["campaigns.create", "campaigns.update"]) expect(() => compileStrictValidator(schemaOf(op))(payload), op).toThrow();
      expect(() => createCampaign({ ...createBase, targetingCriteria: payload })).toThrow();
      expect(() => updateCampaign({ accountId: "507404993", campaignId: "403553896", targetingCriteria: payload })).toThrow();
      const updated: any = registry.executeAction("linkedin-ads", "campaigns.update", { accountId: "507404993", campaignId: "403553896", targetingCriteria: payload });
      expect(updated.ok).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// LI-G1b amend (PLAT-OUT-1 ruling): the 6 Reconcile-update / delete output
// schemas are closed with connector/action/source optional (no pinned action).
// Every output path validates (a) as emitted today, WITH connector/action/
// source, and (b) with those 3 keys stripped (post-PLAT-OUT-1 shape).
// ---------------------------------------------------------------------------

const PLAT_OUT_OPS = ["campaign_groups.update", "campaigns.update", "creatives.update", "campaign_groups.delete", "campaigns.delete", "creatives.delete"];

function bothShapesValidate(op: string, output: Record<string, unknown>, label: string): void {
  const validate = outputValidator(op);
  expect(() => validate(output), `${label} (with metadata)`).not.toThrow();
  const stripped = stripMetadata(output);
  for (const key of RUNNER_METADATA) expect(Object.hasOwn(stripped, key)).toBe(false);
  expect(() => validate(stripped), `${label} (metadata stripped)`).not.toThrow();
}

describe("LI-G1b amend: PLAT-OUT-1 output schemas validate with and without runner metadata", () => {
  for (const op of PLAT_OUT_OPS) {
    it(`${op} outputSchema is closed, metadata optional, action not pinned`, () => {
      const schema = operations[op]!.outputSchema as Record<string, any>;
      expect(schema.additionalProperties).toBe(false);
      for (const key of RUNNER_METADATA) {
        expect(schema.required).not.toContain(key);
        expect(schema.properties[key], key).toEqual({ type: "string" });
      }
      expect(JSON.stringify(schema.properties.action)).not.toContain("enum");
      expect(JSON.stringify(schema.properties.action)).not.toContain("const");
    });

    it(`${op} fixture registry output validates with and without connector/action/source`, async () => {
      const output = await run(byOperation.get(op)!) as Record<string, unknown>;
      bothShapesValidate(op, output, `${op} registry`);
    });
  }

  it("creatives.update outputSchema declares its real fields only", () => {
    const schema = operations["creatives.update"]!.outputSchema as Record<string, any>;
    expect(schema.required).toEqual(["creative"]);
    expect(Object.keys(schema.properties).sort()).toEqual(["action", "connector", "creative", "source", "updated", "validated"]);
    expect(() => outputValidator("creatives.update")({ creative: null, extra: true })).toThrow("extra");
  });

  for (const { update, observe, entity, direct, input } of RECONCILE) {
    it(`${update}: reconciled ${observe} output validates with and without metadata`, async () => {
      const observed = await run(byOperation.get(observe)!) as Record<string, unknown>;
      expect(observed.action).toBe(observe);
      expect(observed[entity]).not.toBeNull();
      bothShapesValidate(update, observed, `${observe} raw observe`);
      const dispatched = await run(byOperation.get(update)!) as Record<string, unknown>;
      expect(dispatched.action).toBe(observe);
      bothShapesValidate(update, dispatched, `${update} reconciled dispatch`);
    });

    it(`${update}: direct (204) and dry-run outputs validate with and without metadata`, async () => {
      const live = await direct({ accessToken: "fixture-access-value", ...input, fetch: ok204 }) as Record<string, unknown>;
      bothShapesValidate(update, live, `${update} direct 204`);
      const dry = await direct({ ...input }) as Record<string, unknown>;
      bothShapesValidate(update, dry, `${update} direct dry run`);
      const dispatched: any = registry.executeAction("linkedin-ads", update, { ...input });
      expect(dispatched.ok).toBe(true);
      bothShapesValidate(update, await dispatched.output, `${update} registry dry run`);
    });
  }

  for (const { op, statusField, handler, input } of DELETES) {
    it(`${op}: live and dry-run outputs validate with and without metadata`, async () => {
      const live = await handler({ accessToken: "fixture-access-value", ...input, fetch: sequence([{ status: 200, body: { [statusField]: "DRAFT" } }, { status: 204 }]) }) as Record<string, unknown>;
      bothShapesValidate(op, live, `${op} live`);
      const dry = await handler({ ...input }) as Record<string, unknown>;
      bothShapesValidate(op, dry, `${op} dry run`);
      const dispatched: any = registry.executeAction("linkedin-ads", op, { ...input });
      expect(dispatched.ok).toBe(true);
      bothShapesValidate(op, await dispatched.output, `${op} registry dry run`);
    });
  }
});
