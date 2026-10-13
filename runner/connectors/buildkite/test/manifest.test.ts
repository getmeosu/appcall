import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const ORIGIN_SHA256: Record<string, string> = {
  "healthcheck": "f2d0c352b5c9c9b1826346e114acc566efff573c33c7d5ac897139af28674632",
  "organizations.list": "85ba5fac34e1e624489324e443473c29a25b6e7a36e9c35311f5f0f4ac2c4918",
  "pipelines.list": "86e23d8cd00a13211b4a2904c92c70e4b42332c75224a07679a3a4eff56dbf17",
  "builds.list": "dc35939030ebd308418ea3003b548f088a9b6e4defcf594337e04de640bbe22a",
  "organizations.get": "2e4e2aea438a3787aa5ce791611debfe10035fbced43d8dbf58c548ad0341c16",
  "pipelines.get": "06cae7a3f789c02ec4cc00267f9fc551f0915556968134f850199a1ac10c53c8",
  "pipelines.create": "101a0cbb9e6c3aa461f879fde132e42ca38cebafcac6dfdb09fbf440b619171e",
  "pipelines.update": "cc9df713002dbe6da7229b239f89f8e5c7e85a3797f83cd76a3f04fd823f5de2",
  "pipelines.delete": "417ce6e06e6027056dd3b362de25272f8376bbb4c85e8b6b75043b9a4a6c7a55",
  "builds.get": "0401c7ed2d73d23758089a269eeeefb6d69f992da52ed8d662c7b6161e163fb7",
  "builds.create": "5742e615249920ca6d9c45afe4616d353161e6ba6dfa4051da28fceecb281d9c",
  "builds.cancel": "8cd0e13a1d4cdec86b107d21c975414611bae5dad2bb74cc2585274eb915470f",
  "builds.rebuild": "33cec2d38acc6c0dc70943f78b138bc3d127ea451d81cf1a011f06b1980ec476",
  "agents.list": "9fb98818ec909b8cf7d4eb6ab3da331fd85e9bf61e03de99182f0647217f573c",
  "agents.get": "b213019f3d55f05c355533338e67b35e1454c5e41dc0305eb07b8b2d9493e4c6",
  "artifacts.list": "45e43c91d8b8c03709541ff94a51a42022073e90caae7644c4aa82b96d71474e",
  "jobs.unblock": "9ef673fff37160512796002fb97e28d577e992869800c516970b1ce7df9d704c",
  "teams.list": "f38774395aa9cba9b7f0fc99a7eba9faf50a0e17f6e79dbb19f3b3145aba65c7",
  "clusters.list": "cec074d0f8dc1874b9457bab91934dd5735f96ffea491181974fe46ce6f8364a",
  "user.get": "e2a38e6d233cfb39f242d53c6dfc43e60ff8516139a882b89e3c3ca43eccc2fd",
};

const RECIPE_SHA256 = "760d9df687ffd07e641b23cb69ada84903172b988ac83e3ed362aed60a2cc501";
const ADDED: Record<string, string> = {
  BUILDKITE_GET_CURRENT_ACCESS_TOKEN: "/access-token",
  BUILDKITE_GET_META: "/meta",
};

describe("buildkite manifest", () => {
  test("bumps the patch and keeps bearer auth on api.buildkite.com", () => {
    expect(manifest.key).toBe("buildkite");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.buildkite.com/v2");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.setup.fields).toEqual([
      { key: "apiKey", label: "Buildkite API access token", required: true, secret: true },
    ]);
    expect(manifest.network.allowedHosts).toEqual(["api.buildkite.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal", () => {
    expect(Object.keys(operations)).toHaveLength(22);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(20);
    expect(Object.keys(operations).slice(0, 20)).toEqual(Object.keys(ORIGIN_SHA256));
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
  });

  test("adds the two documented JSON GET routes without a body or Content-Type", () => {
    for (const [key, path] of Object.entries(ADDED)) {
      const request = operations[key]?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe("GET");
      expect(request.path, key).toBe(path);
      expect(request.body, key).toBeUndefined();
      expect(request.headers, key).toBeUndefined();
      expect(request.query, key).toBeUndefined();
      expect(request.success, key).toEqual([200]);
      expect(operations[key].sideEffect, key).toBe("read");
      expect(operations[key].kind, key).toBe("action");
      expect(operations[key].responseFormat, key).toBe("json");
      expect(operations[key].outputSchema.type, key).toBe("object");
      expect(String(request.path), key).not.toMatch(/\{\{|\{[A-Za-z]/);
      expect(request.path.startsWith("/v2"), key).toBe(false);
    }
    const paths = Object.values(operations).map((op) => op.request?.path);
    expect(paths.filter((path) => path === "/access-token")).toHaveLength(1);
    expect(paths.filter((path) => path === "/meta")).toHaveLength(1);
  });

  test("bounds every action", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(["read", "write", "destructive"]).toContain(op.sideEffect);
      expect(op.kind, key).toBe("action");
      expect(op.enforceOutputSchema, key).toBe(true);
      expect(op.outputSchema.type, key).toBe("object");
      expect(String(op.request.path), key).not.toContain("wss");
      expect(String(manifest.http.baseUrl), key).toMatch(/^https:\/\//);
    }
  });

  test("copies the origin recipe unchanged and leaves new keys as a recipe gap", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/buildkite/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations)).toEqual(Object.keys(ORIGIN_SHA256));
    for (const key of Object.keys(ADDED)) {
      expect(recipe.manifest.operations[key], key).toBeUndefined();
      expect(recipe.operationSources[key], key).toBeUndefined();
      expect(recipe.selection.operations, key).not.toContain(key);
    }
  });
});
