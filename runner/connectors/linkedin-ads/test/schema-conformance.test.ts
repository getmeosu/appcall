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
