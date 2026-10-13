import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/postgrid/recipe.json";
const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
  selection: { operations: string[] };
  operationSources: Record<string, unknown>;
  manifest: { operations: Record<string, unknown>; version: string };
};

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("postgrid manifest", () => {
  it("keeps the public api-key contract and pinned provenance", () => {
    expect(manifest.key).toBe("postgrid");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("x-api-key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.postgrid.com/print-mail/v1");
    expect(manifest.network.allowedHosts).toEqual(["api.postgrid.com"]);
    expect(manifest.provenance).toEqual({
      source: { url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" },
    });
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const actions = Object.entries(operations);
    expect(actions.length).toBe(62);
    expect(Object.keys(operations)).toContain("healthcheck");
    expect(Object.keys(operations)).toContain("contacts.list");
    expect(Object.keys(operations)).toContain("letters.create");
    expect(Object.keys(operations)).toContain("cheques.cancel_with_note");
    expect(Object.keys(operations)).toContain("boxes.progress");
    expect(Object.keys(operations)).toContain("webhooks.create");
    expect(Object.keys(operations)).toContain("return_envelope_orders.fill");
    expect(Object.keys(operations)).toContain("return_envelope_orders.fills");
    expect(Object.keys(operations)).toContain("postal_statements.list");
    for (const [, operation] of actions) {
      expect(operation.kind).toBe("action");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema?.type).toBe("object");
      const request = operation.request as { method?: string; path?: string } | undefined;
      expect(request?.method).toMatch(/^(GET|POST|PATCH|PUT|DELETE)$/);
      expect(typeof request?.path).toBe("string");
      expect(String(request?.path).length).toBeGreaterThan(0);
    }
  });

  it("maps every Composio PostGrid tool onto a runner operation", () => {
    expect(mapping.composio_tools).toBe(60);
    expect(Object.keys(mapping.aligned).length).toBe(60);
    expect(mapping.skipped).toEqual({});
    expect(mapping.aligned.POSTGRID_FILL_TEST_RETURN_ENVELOPE_ORDER).toBe("return_envelope_orders.fills");
  });

  it("keeps the unchanged 0.2.0 recipe and leaves plural fills as the only gap", () => {
    expect(existsSync(recipePath)).toBe(true);
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(61);
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(["return_envelope_orders.fills"]);
    expect(runnerOps).toEqual([...recipeOps, "return_envelope_orders.fills"].sort());
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("adds a body-less plural /fills test fill beside singular /fill", () => {
    const fill = operations["return_envelope_orders.fill"]!;
    const fills = operations["return_envelope_orders.fills"]!;
    expect((fill.request as { path: string }).path).toBe("/return_envelopes/{{id}}/orders/{{orderId}}/fill");
    expect(fills.sideEffect).toBe("write");
    expect(fills.timeoutMs).toBe(fill.timeoutMs);
    expect(fills.maxInputBytes).toBe(fill.maxInputBytes);
    expect(fills.maxResponseBytes).toBe(fill.maxResponseBytes);
    expect(fills.outputSchema).toEqual(fill.outputSchema);
    expect(fills.inputSchema).toEqual(fill.inputSchema);
    expect(fills.responseFormat).toBe("json");
    expect(fills.validationMode).toBe(fill.validationMode);
    expect(fills.enforceOutputSchema).toBe(fill.enforceOutputSchema);
    expect(fills.title).toBe("Plural /fills test fill");
    expect(String(fills.description)).toContain("Plural /fills test fill");
    expect(String(fills.description)).toContain("distinct from the singular /fill op");
    const request = fills.request as {
      method: string;
      path: string;
      baseUrl?: string;
      success: number[];
      body?: unknown;
      headers?: Record<string, string>;
    };
    expect(request).toEqual({
      method: "POST",
      path: "/return_envelopes/{{id}}/orders/{{orderId}}/fills",
      success: [200],
    });
    expect(request.baseUrl).toBeUndefined();
    expect(request.body).toBeUndefined();
    expect(request.headers).toBeUndefined();
    const schema = fills.inputSchema as { type: string; additionalProperties: boolean; required: string[] };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["id", "orderId"]);
  });
});
