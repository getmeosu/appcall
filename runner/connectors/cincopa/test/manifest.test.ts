import { createHash } from "node:crypto";
import { expect, it } from "bun:test";
import manifest from "../manifest.json";

const ORIGIN_OPS = [
  "healthcheck",
  "galleries.list",
  "gallery.items.list",
  "assets.list",
  "galleries.create",
  "galleries.set_meta",
  "galleries.delete",
  "galleries.add_item",
  "galleries.remove_item",
  "galleries.download",
  "assets.tags.list",
  "assets.set_meta",
  "assets.delete",
  "assets.get_upload_url",
  "assets.upload_from_url",
  "assets.upload_status",
  "tokens.get_temp",
  "webhooks.list",
  "portals.list",
  "live.list",
] as const;

const ORIGIN_OPS_SHA256 = "dedeed62dbb9bda19f4ef18c0cc64c061180ee0c530d7317120f5dec82bd34c2";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.key).toBe("cincopa");
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect("full_depth" in manifest).toBe(false);
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
    expect(String(op.request.path).includes("{")).toBe(false);
    expect(String(op.request.baseUrl ?? manifest.http.baseUrl).startsWith("https://")).toBe(true);
    if (op.request.method === "GET" || op.request.method === "DELETE" || op.request.body === undefined) {
      expect(op.request.headers?.["Content-Type"]).toBeUndefined();
    }
  }
});

it("keeps origin Cincopa operations and auth, and adds only the abort POST", () => {
  expect(manifest.http.baseUrl).toBe("https://api.cincopa.com/v2");
  expect(manifest.network.allowedHosts).toEqual(["api.cincopa.com"]);
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "query",
    name: "api_token",
    value: "{{apiKey}}",
  });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  const ops = manifest.operations as Record<string, any>;
  expect(Object.keys(ops)).toEqual([...ORIGIN_OPS, "assets.upload_from_url_abort"]);
  const originOps = { ...ops };
  delete originOps["assets.upload_from_url_abort"];
  expect(createHash("sha256").update(JSON.stringify(originOps)).digest("hex")).toBe(ORIGIN_OPS_SHA256);
  expect(ops["assets.upload_from_url"].request).toEqual({
    method: "POST",
    path: "/asset.upload_from_url.json",
    success: [200],
    query: { input: "{{input}}", fid: "{{fid}}" },
  });
  expect(ops["assets.upload_status"].request).toEqual({
    method: "GET",
    path: "/asset.upload_from_url_get_status.json",
    success: [200],
    query: { status_id: "{{statusId}}" },
  });
  const abort = ops["assets.upload_from_url_abort"];
  expect(abort.sideEffect).toBe("write");
  expect(abort.request).toEqual({
    method: "POST",
    path: "/asset.upload_from_url_abort.json",
    success: [200],
    query: { status_id: "{{statusId}}" },
  });
  expect(abort.request.body).toBeUndefined();
  expect(abort.request.headers).toBeUndefined();
  expect(Object.values(ops).some((op) => op.request?.path === "/upload.iframe")).toBe(false);
});
