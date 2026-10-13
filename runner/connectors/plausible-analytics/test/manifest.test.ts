import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http?.baseUrl).toBe("https://plausible.io/api");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.network?.allowedHosts).toEqual(["plausible.io"]);
  expect(manifest.auth?.setup?.fields?.find((field: { key: string }) => field.key === "siteId")).toMatchObject({
    key: "siteId",
    required: true,
  });
  expect(JSON.stringify(manifest)).not.toContain("{{baseUrl}}");
  const health = manifest.operations["health.get"] as { request?: { method?: string; path?: string; body?: unknown; headers?: unknown } };
  const capabilities = manifest.operations["plugins.capabilities"] as { request?: { method?: string; path?: string; body?: unknown; headers?: unknown } };
  expect(health?.request).toEqual({ method: "GET", path: "/health", success: [200] });
  expect(capabilities?.request).toEqual({ method: "GET", path: "/plugins/v1/capabilities", success: [200] });
  expect(Object.values(manifest.operations).some((op) => (op as { request?: { path?: string } }).request?.path === "/event")).toBe(false);
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.sideEffect).toBe("read");
      expect(op.request).toBeUndefined();
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
