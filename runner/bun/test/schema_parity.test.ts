// SCHEMA-COMB-1 parity: the runner registry validator and the control plane
// validator (crates/appcall-connectors/src/schema.rs) must agree on every case
// in the shared fixture. The Rust side runs the same file in
// crates/appcall-connectors/tests/schema_combinators.rs.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileStrictValidator } from "../src/declarative/strict-schema";
import { buildInputValidators, validateDispatchInput } from "../src/input_schema";

type Case = { accept: unknown[]; reject: unknown[] };
const fixture = JSON.parse(readFileSync(new URL("../../../crates/appcall-connectors/tests/schema_parity.json", import.meta.url), "utf8")) as {
  operations: Array<Case & { connector: string; operation: string }>;
  schemas: Array<Case & { name: string; schema: Record<string, unknown> }>;
  unsupported: Array<{ name: string; schema?: Record<string, unknown>; generate?: string }>;
};
const connectorsRoot = new URL("../../connectors", import.meta.url).pathname;

// Mirrors `generated` in crates/appcall-connectors/tests/schema_combinators.rs.
function generated(kind: string): Record<string, unknown> {
  if (kind === "wideAnyOf") return { anyOf: Array.from({ length: 65 }, (_, i) => ({ required: [`k${i}`] })) };
  if (kind === "deepAnyOf") {
    let schema: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 80; i++) schema = { anyOf: [schema] };
    return schema;
  }
  throw new Error(`unknown generator ${kind}`);
}

function accepts(validate: (input: unknown) => unknown, input: unknown): boolean {
  try {
    validate(input);
    return true;
  } catch {
    return false;
  }
}

describe("schema parity with the control plane validator", () => {
  test("covers all nine github combinator operations", () => {
    expect(fixture.operations.map((c) => c.operation).sort()).toEqual([
      "deployments.create", "deployments.get", "discussions.comments.create", "discussions.comments.list",
      "discussions.comments.update", "discussions.get", "discussions.update", "environments.get", "releases.assets.get",
    ]);
  });

  for (const c of fixture.operations) {
    test(`${c.connector}.${c.operation} through registry dispatch validation`, () => {
      const manifest = JSON.parse(readFileSync(`${connectorsRoot}/${c.connector}/manifest.json`, "utf8"));
      const validators = buildInputValidators([manifest]);
      for (const input of c.accept) expect(validateDispatchInput(validators, c.connector, c.operation, input), JSON.stringify(input)).toBeNull();
      for (const input of c.reject) expect(validateDispatchInput(validators, c.connector, c.operation, input)?.code, JSON.stringify(input)).toBe("INVALID_ACTION_INPUT");
    });
  }

  for (const c of fixture.schemas) {
    test(`inline: ${c.name}`, () => {
      const validate = compileStrictValidator(c.schema, { registry: true });
      for (const input of c.accept) expect(accepts(validate, input), `accept ${JSON.stringify(input)}`).toBe(true);
      for (const input of c.reject) expect(accepts(validate, input), `reject ${JSON.stringify(input)}`).toBe(false);
    });
  }

  for (const c of fixture.unsupported) {
    test(`unsupported: ${c.name}`, () => {
      const schema = c.generate ? generated(c.generate) : c.schema!;
      expect(() => compileStrictValidator(schema, { registry: true })).toThrow();
      expect(() => buildInputValidators([{ key: "probe", operations: { op: { kind: "action", inputSchema: schema } } }])).toThrow("inputSchema cannot be enforced at dispatch");
    });
  }

  test("branch limit is inclusive and the total node budget is enforced", () => {
    const atLimit = compileStrictValidator({ anyOf: Array.from({ length: 64 }, (_, i) => ({ required: [`k${i}`] })) }, { registry: true });
    expect(accepts(atLimit, { k63: 1 })).toBe(true);
    expect(accepts(atLimit, { nope: 1 })).toBe(false);
    const branch = { properties: Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`p${i}`, { type: "string" }])) };
    expect(() => compileStrictValidator({ anyOf: Array.from({ length: 64 }, () => branch) }, { registry: true })).toThrow("Schema nesting exceeds limit");
  });

  test("an input-size limit inside a branch propagates instead of reading as a non-match", () => {
    const validate = compileStrictValidator({ anyOf: [{ type: "array" }, { type: "string" }] });
    expect(() => validate(Array.from({ length: 5000 }, () => 1))).toThrow("Input nesting exceeds limit");
  });
});
