import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http?.baseUrl).toBe("https://api.mxtoolbox.com");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "{{apiKey}}",
  });
  expect(Object.keys(manifest.operations)).toHaveLength(24);
  const operations = manifest.operations as Record<string, any>;
  expect(operations["lookup.mta_sts"].request).toEqual({
    method: "GET",
    path: "/api/v1/lookup/mta-sts/{{domain}}",
    success: [200],
    baseUrl: "https://mxtoolbox.com",
  });
  expect(operations["lookup.ping"].request).toEqual({
    method: "GET",
    path: "/api/v1/lookup/ping/{{domain}}",
    success: [200],
    baseUrl: "https://mxtoolbox.com",
  });
  expect(operations["lookup.mta_sts"].inputSchema.required).toEqual(["domain"]);
  expect(operations["lookup.ping"].inputSchema.required).toEqual(["domain"]);
  expect(operations["lookup.mta_sts"].request.body).toBeUndefined();
  expect(operations["lookup.ping"].request.body).toBeUndefined();
  expect(operations["lookup.mta_sts"].request.headers).toBeUndefined();
  expect(operations["lookup.ping"].request.headers).toBeUndefined();
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect(manifest.network?.allowedHosts).toEqual(["api.mxtoolbox.com", "mxtoolbox.com"]);
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    expect(op.sideEffect).toMatch(/^(read|write|destructive)$/);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      expect(op.sideEffect).toBe("read");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
