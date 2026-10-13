import { expect, it } from "bun:test";
import manifest from "../manifest.json";

const originKeys = [
  "healthcheck",
  "content.list",
  "content.get",
  "pages.get",
  "sitemap.flat",
  "sitemap.nested",
  "pages.getByPath",
  "galleries.get",
  "sync.items",
  "sync.pages",
  "urlredirections.list",
  "content.save",
  "content.publish",
  "content.unpublish",
  "content.delete",
  "pages.publish",
  "pages.delete",
  "containers.list",
  "assets.list",
  "locales.list",
];

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.full_depth).toBeUndefined();
  expect(manifest.http?.baseUrl).toBe("https://api.aglty.io");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "APIKey",
    value: "{{apiKey}}",
  });
  expect(manifest.network?.allowedHosts).toEqual(["api.aglty.io", "mgmt.aglty.io"]);
  const ops = manifest.operations as Record<string, any>;
  expect(Object.keys(ops)).toEqual([...originKeys, "AGILITY_CMS_GET_API_TYPES"]);
  const types = ops.AGILITY_CMS_GET_API_TYPES;
  // Management OpenAPI path is /api/v1/types with no guid segment.
  expect(types.request).toEqual({
    method: "GET",
    path: "/api/v1/types",
    success: [200],
    headers: {
      Accept: "application/json",
      Authorization: "Bearer {{apiKey}}",
    },
    baseUrl: "https://mgmt.aglty.io",
  });
  expect(types.request.body).toBeUndefined();
  expect(types.request.headers["Content-Type"]).toBeUndefined();
  expect(types.inputSchema).toEqual({
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  expect(types.outputSchema.type).toBe("object");
  expect(types.outputSchema.properties.data.type).toBe("object");
  expect(types.sideEffect).toBe("read");
  expect(ops["locales.list"].request.headers).toEqual({
    Accept: "application/json",
    Authorization: "Bearer {{apiKey}}",
  });
  expect(ops["locales.list"].request.baseUrl).toBe("https://mgmt.aglty.io");
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThanOrEqual(1);
    expect(op.timeoutMs).toBeLessThanOrEqual(300000);
    expect(op.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      expect(op.sideEffect).toBe("read");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(["read", "write", "destructive"]).toContain(op.sideEffect);
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
