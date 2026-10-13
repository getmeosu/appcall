import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const ORIGIN_SHA256: Record<string, string> = {
  healthcheck: "38a9b8bd04880a72f4ccd7c354d483e44b99b3826f76a1c73c62e56b6bfa1435",
  "organizations.list": "968a9f0f5a52cbd25cd2cb6592308e2b2ba2a1fc2c8920aefb9b6e3bb09d0674",
  "products.list": "7b7e3db2641601868801a45220486e10494ee49f455546987f0300bd1c6806d3",
  "products.get": "a79ae17d29771ceba7d72e334b2a7e36f16ebf5f37a45d12eaddac26441f87fd",
  "products.create": "0f4b684852ee50c3cea0dcb5c5e3b8c72cb08e18d36862f33bcf5d0f32cc5369",
  "products.update": "8d066d3fd66cde426c6198ff85be6f9eae8f6601cb7c44c6c60476b5987c31f0",
  "products.delete": "f851a6f9e7de737772f4334436436f3f1ba75c85b58f1d7369b9f40e32bab082",
  "configs.list": "fc6b73e7dd2f85cce26e4d4a98ced0d459866a7f6f92f2b8a82926948da96a72",
  "configs.get": "c6b234b1e4358b115fc60e3ce62709c1f0ee847817f1aec47b324203f3d71bdd",
  "configs.create": "cbf1b0d2a38bdfd040a9c14e2e0d37bbd47f543a2a7b57202f7f0eceaefc7b84",
  "configs.update": "c8f17438d51b39636fb2a2f992dbadd39eb9bacfa8bba6a8dfe7036f6030bd62",
  "configs.delete": "47a1d8734fbd1e670f3a9862e47525fcfcb74b54bd9f5afefc724d365e41e24e",
  "environments.list": "c49de394a2f39167b56ce041d8b0deed5d274c4bbe48ba4bc6859e7f0d673017",
  "environments.get": "1882682831a2375b2b3acb0185823e57a5909081cabd59f8eb02cb105ecfe338",
  "environments.create": "055d9a612d748d5e46a9cb2df07b958c40b6e2d90561d9aec83872aec90dec4e",
  "settings.list": "4670376c2ef829d9f4a040026c428d28f0ad937d36657bc6ff4e5e504ad0da1d",
  "settings.get": "883c5fa3c22905348a0ed89e59ee4837680f37d58328bf5e171aa7d640c5f562",
  "settings.create": "ff53c8fdc75c4f782c0fc2761177e9e9ecb7244281be1c4a6f1030ce555dcad1",
  "tags.list": "b5b1ff8f7352e976fef6b88ebdcfb12802ab7c88da47dfde09dc0700bee960f2",
  "tags.get": "0b3713d0fb5d8a804e48f5dae608505ea4da825803fa8cab1a378ce91ee18fde",
  "sdkkeys.get": "ef0d59511eec1d2aa3987ee8c22af1db8329dee0be2f22588d7877c075d8acb8",
  "webhooks.list": "a86c88aa7ccb9089e2886542d94c439d4bbd989a28c997b6b4b593fdd2187a6a",
};

const RECIPE_SHA256 = "da67332e0942720707f7073f7e299e3872bd583135413fd9ec5046b2d773b57e";

const ADDED: Record<string, { method: string; path: string; body: boolean }> = {
  "settings.value.get": {
    method: "GET",
    path: "/v2/environments/{{environmentId}}/settings/{{settingId}}/value",
    body: false,
  },
  "settings.values.list": {
    method: "GET",
    path: "/v2/configs/{{configId}}/environments/{{environmentId}}/values",
    body: false,
  },
  "settings.value.patch": {
    method: "PATCH",
    path: "/v2/environments/{{environmentId}}/settings/{{settingId}}/value",
    body: true,
  },
  "settings.value.replace": {
    method: "PUT",
    path: "/v2/environments/{{environmentId}}/settings/{{settingId}}/value",
    body: true,
  },
  "settings.metadata.update": {
    method: "PATCH",
    path: "/v1/settings/{{settingId}}",
    body: true,
  },
};

// ops the pinned recipe has real provenance for (includes the webhook entries the runner manifest does not expose)
const PINNED_OPS = [
  "configs.create",
  "configs.delete",
  "configs.get",
  "configs.list",
  "configs.update",
  "environments.create",
  "environments.get",
  "environments.list",
  "healthcheck",
  "organizations.list",
  "products.create",
  "products.delete",
  "products.get",
  "products.list",
  "products.update",
  "sdkkeys.get",
  "settings.create",
  "settings.get",
  "settings.list",
  "tags.get",
  "tags.list",
  "webhook.config_changed",
  "webhook.setting_changed",
  "webhooks.list",
];

// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "settings.metadata.update",
  "settings.value.get",
  "settings.value.patch",
  "settings.value.replace",
  "settings.values.list",
];

describe("configcat manifest", () => {
  test("bumps the patch and keeps basic auth on api.configcat.com", () => {
    expect(manifest.key).toBe("configcat");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.configcat.com");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: {
        username: "{{apiKey}}",
        password: "{{password}}",
      },
    });
    expect(manifest.network.allowedHosts).toEqual(["api.configcat.com"]);
    expect(String(manifest.http.baseUrl).startsWith("https://")).toBe(true);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal, including settings.list, settings.get, and settings.create", () => {
    expect(Object.keys(operations)).toHaveLength(27);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(22);
    expect(Object.keys(operations).slice(0, 22)).toEqual(Object.keys(ORIGIN_SHA256));
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
    expect(operations["settings.list"].request).toEqual({
      method: "GET",
      path: "/v1/configs/{{configId}}/settings",
    });
    expect(operations["settings.get"].request.path).toBe("/v1/settings/{{settingId}}");
    expect(operations["settings.create"].request.method).toBe("POST");
    expect(operations["settings.create"].request.path).toBe("/v1/configs/{{configId}}/settings");
  });

  test("adds the five documented JSON routes and no body-less delete", () => {
    for (const [key, spec] of Object.entries(ADDED)) {
      const request = operations[key]?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe(spec.method);
      expect(request.path, key).toBe(spec.path);
      expect(request.success, key).toEqual([200]);
      expect(operations[key].responseFormat, key).toBe("json");
      expect(operations[key].outputSchema.type, key).toBe("object");
      expect(operations[key].outputSchema.properties.data.type, key).toBe("object");
      if (spec.body) {
        expect(request.body, key).toBeDefined();
        expect(request.headers, key).toEqual({ "Content-Type": "application/json" });
        expect(operations[key].sideEffect, key).toBe("write");
      } else {
        expect(request.body, key).toBeUndefined();
        expect(request.headers, key).toBeUndefined();
        expect(request.query, key).toBeUndefined();
        expect(operations[key].sideEffect, key).toBe("read");
      }
    }
    expect(operations["settings.value.patch"].request.body).toBe("{{patch}}");
    expect(operations["settings.metadata.update"].request.body).toBe("{{patch}}");
    expect(operations["settings.value.replace"].request.body).toBe("{{formula}}");
    expect(operations["settings.value.patch"].request.query).toEqual({
      reason: "{{reason}}",
      bypassApproval: "{{bypassApproval}}",
      latestVersionId: "{{latestVersionId}}",
    });
    expect(operations["settings.value.replace"].request.query).toEqual({
      reason: "{{reason}}",
      bypassApproval: "{{bypassApproval}}",
      latestVersionId: "{{latestVersionId}}",
    });
    expect(operations["settings.metadata.update"].request.query).toBeUndefined();
    const paths = Object.values(operations).map((op) => `${op.request.method} ${op.request.path}`);
    expect(paths.filter((path) => path === "DELETE /v1/settings/{{settingId}}")).toHaveLength(0);
    expect(paths.filter((path) => path.includes("/values"))).toEqual([
      "GET /v2/configs/{{configId}}/environments/{{environmentId}}/values",
    ]);
  });

  test("bounds every action and sets Content-Type only when a body is set", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.kind, key).toBe("action");
      expect(op.outputSchema.type, key).toBe("object");
      const headers = op.request.headers ?? {};
      const method = op.request.method;
      if (method === "GET" || method === "DELETE" || op.request.body === undefined) {
        expect(op.request.body, key).toBeUndefined();
        expect(headers["Content-Type"], key).toBeUndefined();
      } else {
        expect(headers["Content-Type"], key).toBe("application/json");
      }
      expect(String(op.request.path), key).not.toContain("wss");
      expect(String(op.request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/configcat/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    expect(recipe.manifest.version).toBe("0.2.0");
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(runnerOps).toEqual(recipeOps);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
  });
});
