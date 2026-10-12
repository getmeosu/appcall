import { describe, expect, test } from "bun:test";
import { renderPath } from "../src/declarative/template";
import { outcomeOf } from "../../connectors/_shared/test/path_segment_harness";

// SEC-PATH-2c-2 (array-shaped input fuzz): an array placeholder renders as its
// comma-joined items, so [""] or [" "] produced an empty or %20 path segment.
describe("declarative path templates reject blank array items", () => {
  for (const bad of [[], [""], [" "], ["  "], ["\t"], ["a", ""], [" ", "b"], [null]]) {
    test(`renderPath rejects ${JSON.stringify(bad)}`, () => {
      expect(() => renderPath("/items/{{ids}}/x", { ids: bad })).toThrow("ids is required");
    });
  }
  test("renderPath keeps real arrays", () => {
    expect(renderPath("/items/{{ids}}/x", { ids: ["a", "b"] })).toBe("/items/a%2Cb/x");
    expect(renderPath("/items/{{ids}}/x", { ids: ["a"] })).toBe("/items/a/x");
  });
  test("renderPath still rejects a dot-only single item", () => {
    expect(() => renderPath("/items/{{ids}}/x", { ids: [".."] })).toThrow("dot path segment is not allowed");
  });
});

const CASES: Array<[string, string, string, Record<string, unknown>]> = [
  ["jira", "components.search", "projectIdsOrKeys", { accessToken: "t", cloudId: "cloud1" }],
  ["trello", "bulk.get", "idOrganizations", { id: "ent1" }],
  ["trello", "bulk.get-bulk", "idOrganizations", { id: "ent1" }],
  ["coingecko", "onchain.pools.multi.get", "pool_addresses", { network: "eth" }],
  ["coingecko", "onchain.tokens.multi.get", "token_addresses", { network: "eth" }],
  ["coingecko", "onchain.tokens.prices.get", "token_addresses", { network: "eth" }],
];

describe("fuzzed array path fields reject blank items before any request", () => {
  for (const [connector, action, field, extra] of CASES) {
    test(`${connector} ${action} ${field}`, async () => {
      const manifest = (await import(`../../connectors/${connector}/manifest.json`)).default;
      const creds: Record<string, unknown> = {};
      for (const f of manifest.auth?.setup?.fields ?? []) creds[f.key] = `cred${f.key}`;
      if (Object.keys(creds).length === 0) creds.accessToken = "t";
      const props = manifest.operations[action].inputSchema.properties as Record<string, unknown>;
      const base: Record<string, unknown> = { ...creds, ...extra };
      for (const k of Object.keys(base)) if (!(k in props) && !(k in creds) && k !== "accessToken" && k !== "cloudId") delete base[k];
      for (const k of Object.keys(props)) if (/^(network|network_id|id)$/.test(k) && base[k] === undefined) base[k] = "net1";
      const good = await outcomeOf(connector, action, { ...base, [field]: ["v1"] });
      expect(good.calls.length, `${connector}.${action} baseline: ${good.code} ${good.message}`).toBeGreaterThan(0);
      expect(new URL(good.calls[0]!.url).pathname).toContain("/v1");
      for (const bad of [[""], [" "], ["  "]]) {
        const result = await outcomeOf(connector, action, { ...base, [field]: bad });
        expect(result.calls, `${connector}.${action} ${field}=${JSON.stringify(bad)}`).toEqual([]);
        expect(result.ok).toBe(false);
      }
    });
  }
});
