import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http?.baseUrl).toBe("https://apipie.ai");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.network?.allowedHosts).toEqual(["apipie.ai"]);
  expect(Object.keys(manifest.operations)).toHaveLength(22);
  const ops = manifest.operations as Record<string, any>;
  expect(ops["models.details"].request.path).toBe("/v1/models/details");
  expect(ops["models.detailed"].request).toMatchObject({ method: "GET", path: "/v1/models/detailed" });
  expect(ops["models.detailed"].request.body).toBeUndefined();
  expect(ops["models.detailed"].request.headers).toBeUndefined();
  expect(ops["queries.list"].request).toMatchObject({ method: "GET", path: "/v1/queries/" });
  expect(ops["queries.list"].request.body).toBeUndefined();
  expect(ops["queries.list"].request.headers).toBeUndefined();
  expect(ops["text.anonymize"].request).toEqual({
    method: "POST",
    path: "/v1/anon",
    success: [200],
    body: { text: "{{text}}" },
    headers: { "Content-Type": "application/json" },
  });
  expect(ops["documents.parse"]).toBeUndefined();
  expect(ops["audio.transcribe"]).toBeUndefined();
  expect(ops["files.upload"]).toBeUndefined();
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
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
    const method = op.request?.method;
    if (method === "GET" || method === "DELETE") {
      expect(op.request.body).toBeUndefined();
      expect(op.request.headers).toBeUndefined();
    }
    if (op.request?.headers) {
      expect(op.request.headers["Content-Type"]).toBe("application/json");
      expect(op.request.body).toBeDefined();
      expect(method).not.toBe("GET");
      expect(method).not.toBe("DELETE");
    }
    expect(op.sideEffect).toBe(/delete/.test(key) ? "destructive" : /create|completions|upsert|update|generations/.test(key) ? "write" : "read");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
