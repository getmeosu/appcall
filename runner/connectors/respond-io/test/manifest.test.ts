import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;

const ORIGIN_SHA256: Record<string, string> = {
  healthcheck: "373e2b9f10de8215421981306569eecdc2e73e03e3b449040887ac41fc51a64b",
  "users.list": "8ba0bb774b833df5598f5a0cc1c3b1e64bcfd9c9f3186a538308d6932f3b7308",
  "channels.list": "cb9cc59ba1c8d1b42b009a67c44f64da45e0eb6d2c95e72f8d6cfa98fa7b88e4",
  "contacts.get": "737d8357e1cd971f1bf8a3a1043cc6423b42c632f41ebd0b3bbe9ada8b40bd06",
  "contacts.list": "8e501c5a758a60b5d99674f157de1e79ccf847d46e931bf82d567376c73bb8fb",
  "contacts.create": "6d8c27508d85fce97038e06797f2442a84cd52267a969bf49177439e021ded30",
  "contacts.update": "df34743b7c8c44d70557b2d6f9c564d92ed782e04e7b21e5a43423bf17a5f6eb",
  "contacts.delete": "bd718653808592737c7183836aa4f5dcde70b13f3a0964fdc00613e8ab7c25ca",
  "contacts.merge": "622d408246e835132ff4264695b6b51f68d032eea0a023dacfdd4fd2fd31e8b8",
  "contacts.channels.list": "3aef221cf3d221ffe1468727e392779b89fa505e801488654cc31e75404c3dea",
  "messages.send": "d1b1547032a47d499e77fbd6031fa8366620beaf3a92753466fc6e886e39124b",
  "messages.get": "236611dd5208872fb27aafa0f2b77c552199ed3c57f34ee37e81dc4cd9724574",
  "messages.list": "0ec6739625bca2b06f3273489ed2df7829e708112211e50e47267a86a0a53eb3",
  "conversations.update_status": "4f3452f03f4a5f29f87033ea98e3109edd48085e56105033730e5498c95a43f1",
  "conversations.assign": "64f09531fcb10ca2a622cf9e202c1f246bcf81efbcd14897f895237c896ef6b0",
  "comments.create": "6e5d775f5a889abfd968f8366f5862231b6c039f19e7f68ffb5cd0d5a8ae3baf",
  "contacts.tags.add": "652fbd9affc238f39a10a7f31b059a5d170f1e1022caafaee87791e177f9df7b",
  "contacts.tags.remove": "7a3c6a379136160d5c7315f280a084741c2d3e3c6ff38fe5abc6a418724fdd0b",
  "tags.create": "8e6875a668b4f2e81e7607b806ada386c0b64e14367537fc5f9c4b4aa07ac048",
  "tags.delete": "a0efa243b142948f6ec5aa43f4a80e04ca5499afd071ace5fdf6bb812b1a9ea5",
};

const ADDED: Record<string, { method: string; path: string }> = {
  "contacts.create_for_identifier": { method: "POST", path: "/contact/{{identifier}}" },
  "space.tags.create": { method: "POST", path: "/space/tag" },
  "space.tags.update": { method: "PUT", path: "/space/tag" },
};

const RECIPE_SHA256 = "3ba2a2974c1b97436fc130d9d806903009ebc71413a426222f0eeafdfde9b684";

describe("respond-io manifest", () => {
  test("bumps only the patch and keeps bearer auth on api.respond.io", () => {
    expect(manifest.key).toBe("respond-io");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(Array.isArray(manifest.operations)).toBe(false);
    expect(manifest.http.baseUrl).toBe("https://api.respond.io/v2");
    expect(manifest.http.baseUrl.startsWith("https://")).toBe(true);
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.network.allowedHosts).toEqual(["api.respond.io"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal", () => {
    expect(Object.keys(operations)).toHaveLength(Object.keys(ORIGIN_SHA256).length + Object.keys(ADDED).length);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(20);
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
  });

  test("adds the three documented JSON write routes", () => {
    expect(Object.keys(ADDED)).toHaveLength(3);
    for (const [key, spec] of Object.entries(ADDED)) {
      const op = operations[key];
      const request = op?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe(spec.method);
      expect(request.path, key).toBe(spec.path);
      expect(request.baseUrl, key).toBeUndefined();
      expect(request.success, key).toEqual([200]);
      expect(request.headers, key).toEqual({ "Content-Type": "application/json" });
      expect(request.body, key).toBeDefined();
      expect(op.sideEffect, key).toBe("write");
      expect(op.responseFormat, key).toBe("json");
      expect(op.kind, key).toBe("action");
      const placeholders = [...String(request.path).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1].trim());
      expect(placeholders, key).toEqual(key === "contacts.create_for_identifier" ? ["identifier"] : []);
      for (const name of placeholders) expect(op.inputSchema.required ?? [], key).toContain(name);
    }
    const paths = Object.values(operations).map((op) => `${op.request.method} ${op.request.path}`);
    expect(paths.filter((item) => item === "POST /contact/{{identifier}}")).toHaveLength(1);
    expect(paths.filter((item) => item === "POST /space/tag")).toHaveLength(1);
    expect(paths.filter((item) => item === "PUT /space/tag")).toHaveLength(1);
  });

  test("bounds every action and puts JSON content type only on bodies", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.title.length, key).toBeGreaterThan(0);
      expect(op.description.length, key).toBeGreaterThan(0);
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.kind, key).toBe("action");
      expect(op.inputSchema.type, key).toBe("object");
      expect(op.inputSchema.additionalProperties, key).toBe(false);
      expect(op.outputSchema.type, key).toBe("object");
      expect(op.enforceOutputSchema, key).toBe(true);
      expect(op.validationMode, key).toBe("strict-generated");
      expect(op.responseFormat, key).toBe("json");
      const headers = op.request.headers ?? {};
      if (op.request.body !== undefined) expect(headers["Content-Type"], key).toBe("application/json");
      else expect(headers["Content-Type"], key).toBeUndefined();
      expect(op.sideEffect, key).toBe(/delete/.test(key) ? "destructive" : /create|update|merge|send|assign|add|remove/.test(key) ? "write" : "read");
      expect(String(op.request.path), key).not.toContain("wss");
    }
  });

  test("copies the origin recipe unchanged and leaves new keys as a recipe gap", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/respond_io/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations)).toEqual(Object.keys(ORIGIN_SHA256));
    for (const key of Object.keys(ADDED)) expect(recipe.manifest.operations[key], key).toBeUndefined();
  });
});
