import { expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/contracts.json";
it("declares a valid identity and category", () => {
  expect(manifest.key).toBe("mastodon");
  expect(manifest.runtime).toBe("bun");
  expect(manifest.categories).toEqual(["social"]);
});
it("collects the exact secret used for authentication", () => {
  expect(manifest.auth.setup.mode).toBe("api_key");
  expect(manifest.auth.setup.fields.filter(f => f.secret).map(f => f.key)).toEqual([manifest.http.auth.field]);
});
it("declares complete bounded tool schemas and classifies writes", () => {
  expect(Object.keys(manifest.operations).sort()).toEqual(cases.map(c => c.operation).sort());
  for (const op of Object.values(manifest.operations)) {
    expect(op.kind).toBe("action");
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxInputBytes).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeGreaterThan(0);
    expect(op.inputSchema.type).toBe("object");
    expect(op.sideEffect).toBe(op.request.method === "GET" ? "read" : "write");
    for (const match of op.request.path.matchAll(/\{\{(\w+)\}\}/g)) {
      expect(op.inputSchema.required).toContain(match[1]);
    }
  }
});
it("returns only selected identity fields from healthcheck", () => {
  expect(JSON.stringify(manifest.operations.healthcheck.request.result)).not.toContain("{{response}}");
});
it("pins HTTPS to the required stored instance hostname", () => {
  expect(manifest.http.baseUrl).toBe("https://{{instance}}");
  expect(manifest.network.allowedHosts).toEqual(["{{instance}}"]);
  expect(manifest.auth.setup.fields.find(f => f.key === "instance")).toMatchObject({ required: true, secret: false });
});

it("keeps live QA read-only and independent of fixed resource IDs", async () => {
  const qa = await Bun.file(new URL("../qa.json", import.meta.url)).json();
  expect(qa.connector).toBe(manifest.key);
  expect(qa.scenarios.length).toBe(2);
  for (const scenario of qa.scenarios) {
    const op = (manifest.operations as Record<string, { sideEffect: string; inputSchema: { required: string[] } }>)[scenario.operation];
    expect(op!.sideEffect).toBe("read");
    expect(op!.inputSchema.required).toEqual([]);
    expect(Object.keys(scenario.input)).not.toContain("instance");
    expect(scenario.expect.assertions.length).toBeGreaterThan(0);
  }
});

for (const fixture of cases) {
  it(`${fixture.operation}: declares the mapped result types`, () => {
    const op = (manifest.operations as Record<string, any>)[fixture.operation];
    expect(op.outputSchema).toBeDefined();
    expect(op.outputSchema.type).toBe("object");
    for (const [field, value] of Object.entries(fixture.result)) {
      const schema = op.outputSchema.properties[field];
      expect(schema).toBeDefined();
      expect(schema.type).toBe(Array.isArray(value) ? "array" : typeof value);
      // Normalized posts intentionally omit optional fields when a provider does.
      if (fixture.operation !== "normalized.post.create" || ["id", "provider", "providerPostId", "modelVersion", "raw"].includes(field)) {
        expect(op.outputSchema.required).toContain(field);
      }
      if (Array.isArray(value)) expect(schema.items.type).toBe("object");
      if (value && typeof value === "object" && !Array.isArray(value) && "id" in value) {
        expect(schema.properties.id.type).toBe("string");
      }
    }
  });
}
