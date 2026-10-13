import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect(manifest.network?.allowedHosts).toEqual(["api.asindataapi.com"]);
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

it("adds the documented JSON destination update and not a body-less collection clear", () => {
  const operations = manifest.operations as Record<string, any>;
  expect(Object.keys(operations)).toHaveLength(23);
  const update = operations["destinations.update"];
  expect(update.request).toMatchObject({
    method: "PUT",
    path: "/destinations/{{destination_id}}",
    headers: { "Content-Type": "application/json" },
    success: [200],
  });
  expect(update.request.body.enabled).toBe("{{enabled}}");
  expect(update.request.body.name).toBe("{{name}}");
  expect(operations["collection-requests.clear"]).toBeUndefined();
  const paths = Object.values(operations).map((op) => op.request?.path);
  expect(paths).not.toContain("/collections/{{collection_id}}/requests");
});
