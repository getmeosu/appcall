import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import dual from "./composio-cover.json";

const summary = JSON.parse(readFileSync(join(import.meta.dir, "../intercom.json"), "utf8")) as {
  ops_after: number;
  composio_tools: number;
  missing_still: unknown[];
  mapped_composio: string[];
};

describe("intercom Composio coverage", () => {
  test("155 operations cover 133 unique Composio tools", () => {
    expect(Object.keys(manifest.operations).length).toBe(155);
    expect(summary.ops_after).toBe(155);
    expect(summary.composio_tools).toBe(133);
    expect(summary.missing_still).toEqual([
      "Detach contact from conversation still omitted: Intercom DELETE /conversations/{id}/customers/{contact_id} requires an admin_id JSON body, which this contract keeps GET/DELETE body-less.",
      "Company tag attach/detach via /companies/{id}/tags is not a separate op; tagging companies remains POST /tags with a companies array on tags.create.",
      "Help center sections stay on Intercom 2.13 /help_center/sections; later Intercom versions folded sections into collections.",
    ]);
    expect(new Set(summary.mapped_composio).size).toBe(133);
    expect(summary.mapped_composio).toHaveLength(133);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("dual-maps three Composio slug pairs onto one operation each", () => {
    const operations = manifest.operations as Record<string, { request?: unknown }>;
    for (const [key, slugs] of Object.entries(dual.dual_mapped)) {
      expect(operations[key], key).toBeDefined();
      expect(operations[key]!.request, key).toBeDefined();
      expect(slugs).toHaveLength(2);
      for (const slug of slugs) {
        expect(summary.mapped_composio).toContain(slug);
      }
    }
  });
});
