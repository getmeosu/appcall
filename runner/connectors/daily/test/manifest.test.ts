import { expect, it } from "bun:test";
import manifest from "../manifest.json";

const originOps = [
  "healthcheck",
  "domain.get",
  "rooms.list",
  "rooms.get",
  "rooms.create",
  "rooms.update",
  "rooms.delete",
  "rooms.presence",
  "meeting-tokens.create",
  "meeting-tokens.validate",
  "meetings.list",
  "meetings.get",
  "recordings.list",
  "recordings.get",
  "recordings.delete",
  "recordings.access-link",
  "presence.list",
  "transcripts.list",
  "transcripts.get",
  "webhooks.list",
];

it("keeps Daily auth and host frozen and adds only POST /batch/rooms", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http.baseUrl).toBe("https://api.daily.co/v1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.network.allowedHosts).toEqual(["api.daily.co"]);
  expect("full_depth" in manifest).toBe(false);
  const ops = manifest.operations as Record<string, any>;
  expect(Object.keys(ops)).toEqual([...originOps, "rooms.batch-create"]);
  const batch = ops["rooms.batch-create"];
  expect(batch.request.method).toBe("POST");
  expect(batch.request.path).toBe("/batch/rooms");
  expect(batch.request.body).toEqual({ rooms: "{{rooms}}" });
  expect(batch.request.headers["Content-Type"]).toBe("application/json");
  expect(batch.outputSchema.type).toBe("object");
  expect(batch.outputSchema.properties.data.type).toBe("array");
  expect(batch.enforceOutputSchema).toBe(true);
  for (const [key, op] of Object.entries(ops)) {
    expect(op.kind).toBe("action");
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
    expect(op.timeoutMs).toBeGreaterThanOrEqual(1);
    expect(op.timeoutMs).toBeLessThanOrEqual(300000);
    expect(op.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    const method = op.request.method;
    if (method === "GET" || method === "DELETE") {
      expect(op.request.body).toBeUndefined();
      expect(op.request.headers?.["Content-Type"]).toBeUndefined();
    }
    if (op.request.body !== undefined) {
      expect(op.request.headers["Content-Type"]).toBe("application/json");
    }
    expect(String(op.request.path).startsWith("http://")).toBe(false);
    expect(String(op.request.path).includes("{") && !String(op.request.path).includes("{{")).toBe(false);
    if (key !== "rooms.batch-create") {
      expect(op.request.path).not.toBe("/batch/rooms");
    }
  }
  const batchDeletes = Object.values(ops).filter((op) => op.request.method === "DELETE" && op.request.path === "/batch/rooms");
  expect(batchDeletes).toEqual([]);
});
