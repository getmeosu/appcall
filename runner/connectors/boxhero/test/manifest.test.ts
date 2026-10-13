import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(Object.keys(manifest.operations)).toHaveLength(23);
  const added = manifest.operations as Record<string, { request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string> }; sideEffect?: string }>;
  expect(added["locations.delete"]?.request).toEqual({ method: "DELETE", path: "/v1/locations/{{location_id}}", success: [200] });
  expect(added["locations.delete"]?.request?.body).toBeUndefined();
  expect(added["locations.delete"]?.request?.headers).toBeUndefined();
  expect(added["locations.delete"]?.sideEffect).toBe("destructive");
  expect(added["itemAttrs.get"]?.request).toEqual({ method: "GET", path: "/v1/item-attrs/{{attr_id}}", success: [200] });
  expect(added["itemAttrs.get"]?.request?.body).toBeUndefined();
  expect(added["itemAttrs.get"]?.request?.headers).toBeUndefined();
  expect(added["teams.linked"]?.request).toEqual({ method: "GET", path: "/v1/teams/linked", success: [200] });
  expect(added["teams.linked"]?.request?.body).toBeUndefined();
  expect(added["teams.linked"]?.request?.headers).toBeUndefined();
  expect(added["transactions.list"]?.request?.path).toBe("/v1/transactions");
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect(manifest.network?.allowedHosts).toEqual(["rest.boxhero-app.com"]);
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
