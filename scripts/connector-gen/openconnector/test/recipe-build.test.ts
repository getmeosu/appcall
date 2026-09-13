import { describe, expect, test } from "bun:test";
import { buildCandidate, validateRecipeSemantics } from "../recipe-build";
import { readRecipe } from "../recipes";
import { loadFixtureCases } from "../recipe-fixtures";
import { join } from "node:path";

describe("recipe build gates", () => {
  test("rejects malformed recipes before candidate construction", () => {
    const recipe = { schemaVersion: 1, providerId: "x", appcallId: "x", source: {}, selection: {}, research: {}, operationSources: {}, manifest: { key: "x", operations: {} } } as never;
    expect(validateRecipeSemantics(recipe).length).toBeGreaterThan(0);
    expect(() => buildCandidate(recipe)).toThrow("RECIPE_INVALID");
  });
  test("builds the pinned Coda recipe with real fixtures", async () => {
    const dir = join(import.meta.dir, "../recipes/coda");
    const recipe = await readRecipe(dir);
    const cases = loadFixtureCases(join(dir, "fixtures/cases"));
    const source = process.env.APPCALL_OPENCONNECTOR_SOURCE;
    if (!source) return;
    const out = await (await import("../recipe-build")).buildRecipeCatalog({ recipes: [recipe], asOf: "2026-09-13", snapshot: { root: source }, fixtureCases: () => cases });
    expect(out.records[0]?.status).toBe("ACCEPTED");
    expect(out.artifacts[recipe.appcallId]?.manifestBytes.length).toBeGreaterThan(0);
  });
  test("rejects raw JSON operations that retain normalized result mapping", async () => {
    const recipe = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = Object.keys(recipe.manifest.operations)[0]!;
    const bad = structuredClone(recipe) as any;
    bad.operationSources[op].responseContract = "appcall-provider-json-v1";
    bad.manifest.operations[op].request.result = { data: "{{response}}" };
    expect(validateRecipeSemantics(bad).some((x) => x.includes("must omit"))).toBe(true);
  });
  test("rejects preserve-existing unknown provider", async () => { const r:any=await readRecipe(join(import.meta.dir,"../recipes/coda")); r.appcallId="mailjet"; r.providerId="mailjet"; expect(validateRecipeSemantics(r).some(x=>x.includes("curated baseline"))).toBe(true); });
  test("rejects preserved operation mutation", async () => { const r:any=await readRecipe(join(import.meta.dir,"../recipes/coda")); const id=Object.keys(r.manifest.operations)[0]!; r.manifest.operations[id].request={}; expect(validateRecipeSemantics(r).some(x=>x.includes("curated baseline"))).toBe(true); });
  test("rejects preserved auth http and network mutation", async () => { const r:any=await readRecipe(join(import.meta.dir,"../recipes/coda")); r.manifest.auth={changed:true}; r.manifest.http={changed:true}; r.manifest.network={changed:true}; expect(validateRecipeSemantics(r).some(x=>x.includes("curated baseline"))).toBe(true); });
  test("requires closed raw JSON output schema", async () => { const r:any=await readRecipe(join(import.meta.dir,"../recipes/coda")); const id=Object.keys(r.manifest.operations)[0]!; r.operationSources[id].responseContract="appcall-provider-json-v1"; r.manifest.operations[id].responseFormat="json"; r.manifest.operations[id].validationMode="strict-generated"; r.manifest.operations[id].enforceOutputSchema=true; r.manifest.operations[id].outputSchema={type:"object",properties:{data:{type:"object"}}}; expect(validateRecipeSemantics(r).some(x=>x.includes("additional properties"))).toBe(true); });
  test("accepts unchanged pinned Coda recipe baseline", async () => { const r:any=await readRecipe(join(import.meta.dir,"../recipes/coda")); expect(validateRecipeSemantics(r)).toEqual([]); });
  test("rejects raw operation inputs that are never bound to a native request", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck;
    r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: { type: "string" }, limit: { type: "integer" } } };
    op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true;
    op.request.path = "/whoami";
    delete op.request.result;
    expect(validateRecipeSemantics(r)).toContain("unused operation input: id");
    expect(validateRecipeSemantics(r)).toContain("unused operation input: limit");
  });
  test("accepts raw operation inputs bound by native templates and parameters", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck;
    r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: { type: "string" }, limit: { type: "integer" }, nested: { type: "string" } } };
    op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true;
    op.request.path = "/items/{{id}}"; op.request.query = { limit: "{{limit}}" };
    op.request.parameters = [{ wireName: "nested", inputName: "nested", in: "query", style: "form", explode: true, allowReserved: false }];
    delete op.request.result;
    expect(validateRecipeSemantics(r)).toEqual([]);
  });
  test("does not treat validation result or input-root placeholders as bindings", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck;
    r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: { type: "string" } } };
    op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true;
    op.request.path = "/whoami"; op.request.echo = { id: "{{id}}" }; delete op.request.result;
    expect(validateRecipeSemantics(r)).toContain("unused operation input: id");
  });
  test("requires complete native placeholders and supports hyphenated and dotted parameter roots", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck;
    r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { "user-id": {}, nested: {} } };
    op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true;
    delete op.request.result; op.request.path = "/users/{{user-id}}";
    op.request.parameters = [{ wireName: "nested.value", inputName: "nested.value", in: "query", style: "form", explode: true, allowReserved: false }];
    expect(validateRecipeSemantics(r)).toEqual([]);
    op.request.path = "/users/{{user-id garbage";
    expect(validateRecipeSemantics(r)).toContain("unused operation input: user-id");
  });
  test("fails closed when native binding traversal exceeds its bounds", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck;
    r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: {} } };
    op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true;
    delete op.request.result;
    let value: any = "{{id}}";
    for (let i = 0; i < 34; i++) value = { nested: value };
    op.request.body = value;
    expect(validateRecipeSemantics(r)).toContain("native request binding scan exceeded bounds");
  });
  test("matches path parameters by wireName, ignores unsupported locations, and honors overrides", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck;
    r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: {}, ignored: {} } };
    op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true;
    delete op.request.result; op.request.path = "/monitors/{{monitorKey}}";
    op.request.parameters = [
      { wireName: "monitorKey", inputName: "id", in: "path", style: "simple", explode: false, allowReserved: false },
      { wireName: "ignored", inputName: "ignored", in: "cookie", style: "simple", explode: false, allowReserved: false },
    ];
    r.manifest.http.query = { id: "{{id}}" }; op.request.query = { id: "constant" };
    expect(validateRecipeSemantics(r)).toContain("unused operation input: ignored");
    expect(validateRecipeSemantics(r)).not.toContain("unused operation input: id");
  });
  test("requires exact dotted path alias token matching", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck; r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: {} } }; op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true; delete op.request.result;
    op.request.path = "/items/{{key.other}}"; op.request.parameters = [{ inputName: "id", wireName: "key.nested", in: "path", style: "simple", explode: false, allowReserved: false }];
    expect(validateRecipeSemantics(r)).toContain("unused operation input: id");
  });
  test("structured query parameter suppresses overridden template binding", async () => {
    const r: any = await readRecipe(join(import.meta.dir, "../recipes/coda"));
    const op = r.manifest.operations.healthcheck; r.operationSources.healthcheck.responseContract = "appcall-provider-json-v1";
    op.inputSchema = { type: "object", properties: { id: {} } }; op.outputSchema = { type: "object", properties: { data: {} }, additionalProperties: false };
    op.responseFormat = "json"; op.validationMode = "strict-generated"; op.enforceOutputSchema = true; delete op.request.result;
    op.request.path = "/items"; op.request.query = { q: "{{id}}" };
    op.request.parameters = [{ inputName: "other", wireName: "q", in: "query", style: "form", explode: false, allowReserved: false }];
    expect(validateRecipeSemantics(r)).toContain("unused operation input: id");
  });
});
