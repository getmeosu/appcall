import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const ORIGIN_SHA256: Record<string, string> = {
  "healthcheck": "3eb11aca07e681be92b14fddaf01efb2153959b659539cb6b40a926cc72e0a9b",
  "topics.list": "7e93bdfd87900ff680418e0c6d7670e70be2ee7046faf0fa16b7606e65c76335",
  "journalists.get": "eb38b41a4ce80b65e0bf72540d7909d9724ce06683015796632f1e7857b7e832",
  "people.search": "ec5fdc77ce799bb0c3a9e075de67ec3c53136f7ad80f3cba4446936edfda4009",
  "journalists.list": "03547f43f42de431e29248ead5deb0df2a00109c97d02e48e5b5f5e3c390daaa",
  "articles.search": "013c07f3d412d9886c7132eec7bcf84a7b225fa2fd62c51dbf3323d7d552da19",
  "stories.search": "43b19bbca2b0ea5f01a16ff218cfb305296d1a5a3fc4a171293a8c76ff6833e4",
  "sources.list": "9d4768c7ada02fa110fd82873a5ead473126a929dbd72c79f9f8fd8fa0b74e24",
  "companies.search": "2a6e8f174b9239432edb7ba9e7f166770abdcb96b1ecf3aad2c464459a868139",
  "vector.search": "1e232ecd4f14c9ee577262dde128abb7a59f729f42b9a8b78e6132a25ead96ca",
  "monitors.list": "d90bc818aee513b3ab5135876e89ac4d31d629d2b4d79d7601b7b4220003df8f",
  "monitors.get": "26d39411950dc298c779840647e9aa97dd530c64cf4d5aab85d407a3615b9110",
  "monitors.create": "7039a1e1c6d0bf9310eb6f92db8e0634718e70d63111acf0d4e183738b5b7c95",
  "monitors.update": "e6c46ef8e021ce3fd2645c6dcaff282cc59895e224ca128751f05b9e6258e90e",
  "monitors.delete": "f8b1a8be7da06c03d606aca49a0f40e58c10bb69de8a0fb54af13699d00e5739",
  "monitors.events": "21ae67f459f1e10e4dc65b42f3712d95a0c23dd617fe6c098fe7cee82485da82",
  "monitors.activate": "1a0acb197927a939703a9b92b026e7ca54c1dbea4f9ea5a593b23a721c1605a0",
  "monitors.pause": "fc848ad458a8545769528a69dc0d1d0fe06c9b0b48ed6918a1a36a56fe8530b5",
  "contactPoints.list": "1e21d3b17c00212d458b882b24f112af67ce2a51c430addcd252e505af17f781",
  "contactPoints.create": "6ea40c082b2a531dfea3da2d7e393d0d0944554e1535430a5d4067a0ee53194f",
  "watchlists.list": "5c674455dd16206035b72607f7582f675f63c5e36624c2212ea89835c4d4ed64",
};

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "articles.search",
  "companies.search",
  "contactPoints.create",
  "contactPoints.list",
  "healthcheck",
  "journalists.get",
  "journalists.list",
  "monitors.activate",
  "monitors.create",
  "monitors.delete",
  "monitors.events",
  "monitors.get",
  "monitors.list",
  "monitors.pause",
  "monitors.update",
  "people.search",
  "sources.list",
  "stories.search",
  "topics.list",
  "vector.search",
  "watchlists.list"
] as const;
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "PERIGON_GET_WIKIPEDIA",
  "PERIGON_VECTOR_SEARCH_WIKIPEDIA"
] as const;

describe("perigon manifest", () => {
  test("bumps the patch and leaves auth and host unchanged", () => {
    expect(manifest.key).toBe("perigon");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.perigon.io");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.auth).toEqual({
      type: "api_key",
      scopes: [],
      setup: {
        mode: "api_key",
        fields: [
          {
            key: "apiKey",
            label: "Perigon API key",
            required: true,
            secret: true,
          },
        ],
      },
    });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.perigon.io"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal", () => {
    expect(Object.keys(operations)).toHaveLength(23);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(21);
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
  });

  test("adds the two documented Wikipedia JSON routes", () => {
    const get = operations.PERIGON_GET_WIKIPEDIA;
    expect(get.request.method).toBe("GET");
    expect(get.request.path).toBe("/v1/wikipedia/all");
    expect(get.request.body).toBeUndefined();
    expect(get.request.headers).toBeUndefined();
    expect(get.request.success).toEqual([200]);
    expect(get.sideEffect).toBe("read");
    expect(get.responseFormat).toBe("json");
    expect(get.outputSchema.type).toBe("object");
    expect(String(get.request.path)).not.toMatch(/\{\{/);

    const vector = operations.PERIGON_VECTOR_SEARCH_WIKIPEDIA;
    expect(vector.request.method).toBe("POST");
    expect(vector.request.path).toBe("/v1/vector/wikipedia/all");
    expect(vector.request.headers["Content-Type"]).toBe("application/json");
    expect(vector.request.body.prompt).toBe("{{prompt}}");
    expect(vector.request.success).toEqual([200]);
    expect(vector.sideEffect).toBe("read");
    expect(vector.responseFormat).toBe("json");
    expect(vector.outputSchema.type).toBe("object");
    expect(vector.outputSchema.properties.data.type).toBe("object");
    expect(String(vector.request.path)).not.toMatch(/\{\{/);

    const paths = Object.values(operations).map((op) => `${op.request.method} ${op.request.path}`);
    expect(paths.filter((path) => path === "GET /v1/wikipedia/all")).toHaveLength(1);
    expect(paths.filter((path) => path === "POST /v1/vector/wikipedia/all")).toHaveLength(1);
  });

  test("bounds every action", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.kind, key).toBe("action");
      expect(op.responseFormat, key).toBe("json");
      expect(op.outputSchema.type, key).toBe("object");
      expect(String(op.request.path).replace(/\{\{[^{}]+\}\}/g, ""), key).not.toMatch(/[{}]/);
      expect(String(op.request.path).startsWith("http://"), key).toBe(false);
      const method = op.request.method;
      if (method === "GET" || method === "DELETE") {
        expect(op.request.body, key).toBeUndefined();
        expect(op.request.headers?.["Content-Type"], key).toBeUndefined();
      }
      if (op.request.body !== undefined) {
        expect(op.request.headers["Content-Type"], key).toBe("application/json");
      }
    }
  });

  test("mirrors the deepened Wikipedia routes in the recipe and keeps provenance mappings pinned", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/perigon/recipe.json", import.meta.url));
    const recipe = JSON.parse(bytes.toString("utf8"));
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });
});
