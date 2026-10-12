import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// PLAT-OUT-1 guard: connector/action/source ride on the result envelope, never on
// result.output. The runner strips the compile-injected copies, so an output schema
// that REQUIRES any of them can never validate. Optional declarations are tolerated
// for now (hand-written handlers on open schemas, linkedin-ads LI-G1b).
const ENVELOPE_KEYS = ["connector", "action", "source"] as const;
const connectorsDir = join(import.meta.dir, "../../connectors");

type Schema = { required?: unknown; allOf?: Schema[]; anyOf?: Schema[]; oneOf?: Schema[] };

function requiredEnvelopeKeys(schema: Schema | undefined): string[] {
  if (!schema || typeof schema !== "object") return [];
  const own = Array.isArray(schema.required)
    ? ENVELOPE_KEYS.filter((key) => (schema.required as unknown[]).includes(key))
    : [];
  const nested = [...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].flatMap(requiredEnvelopeKeys);
  return [...new Set([...own, ...nested])];
}

function manifests(): Array<{ connector: string; manifest: { operations?: Record<string, { outputSchema?: Schema }> } }> {
  return readdirSync(connectorsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(connectorsDir, entry.name, "manifest.json")))
    .map((entry) => ({
      connector: entry.name,
      manifest: JSON.parse(readFileSync(join(connectorsDir, entry.name, "manifest.json"), "utf8")),
    }));
}

describe("PLAT-OUT-1 output schema guard", () => {
  test("no operation output schema in any connector requires connector/action/source", () => {
    const all = manifests();
    expect(all.length).toBeGreaterThan(100);
    const offenders: string[] = [];
    let checked = 0;
    for (const { connector, manifest } of all) {
      for (const [operation, definition] of Object.entries(manifest.operations ?? {})) {
        checked += 1;
        const keys = requiredEnvelopeKeys(definition.outputSchema);
        if (keys.length > 0) offenders.push(`${connector}/${operation}: ${keys.join(",")}`);
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(offenders).toEqual([]);
  });

  test("the guard detects a required envelope key, including inside composite schemas", () => {
    expect(requiredEnvelopeKeys({ required: ["data", "connector"] })).toEqual(["connector"]);
    expect(requiredEnvelopeKeys({ anyOf: [{ required: ["source"] }, { required: ["data"] }] })).toEqual(["source"]);
    expect(requiredEnvelopeKeys({ required: ["data"] })).toEqual([]);
  });
});
