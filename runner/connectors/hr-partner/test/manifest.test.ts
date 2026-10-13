import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const ORIGIN_SHA256: Record<string, string> = {
  healthcheck: "c80f3bba23868291b9707f1e0385c7be21bc15f8a1f9d9c16a0a00cf6872b392",
  "company.get": "5b097880b2226c727a1a9f2fc63a38d4016ceef13bb62ad78ab472817f2713a4",
  "employees.list": "d0d883b67cd59124639384a4efd5cedc2440963168ccb53a66ef11c4e98362f2",
  "employees.get": "275d38d6f5cdd31fa5d9b20479907186c0517f4ccbab43006daa77d981e6757c",
  "jobs.list": "6de73890cb93ee1aa233fd16c59b01acf379b33203663dcb0a265a23ae498d1c",
  "employees.upsert": "7ae473afed31707f9a3853725ef1df7d5a55dd49a07f72d72c7cf3ae011ec3cb",
  "jobs.get": "27239ebde1ee041bcb46455a0a2cecd844af957ea461867f33782fc086c4b261",
  "applicants.list": "f7a8dfd30030aa9cf2e1135cacbe49be0baba31f5a614566fb647db845a3d7a6",
  "applicants.get": "2daf65ffc34c7d01c21db98eac685c953115be002a16b116f218b196dea53930",
  "applications.list": "320080ccf9d15ebd7ffa50347a383e0069347535542556301101917f55651e67",
  "applications.get": "9b651fbde9b76c12d4fccb2f5679d7576f5a47ebb8907b8674ebddeacd936b1c",
  "positions.list": "bb12190c5b9d887d368c1790e2e93b9b80ed5e0b00e844b404dfa49a2d8bfe98",
  "absences.list": "187e5bf13667a77d99c465e4cef001ac7e7cbfbc5d4ec0ac3a6c17875f7d6d34",
  "reminders.list": "245c02cf48be91274afcea6109d331574700ed69fd6f6406f8153a897668a189",
  "reminders.get": "d23647ab7bd3342d9a9964765a211c0d43cc73805ef5582a65a8ebae35e0564c",
  "reminders.update": "213b10a99b7ed93622ce437f762ff601972f6ca233b065cd73483e48544080aa",
  "reminders.delete": "35ebe81b87b2aae5e4191fe52bf1afadbae04cf55995f6aa35292ef7374e923f",
  "timesheets.list": "5eae992c4cfc50107d77dc7cf3f7834c9f32b70a9a28678343f5e05271f82164",
  "leave_requests.list": "601cc4e2b3ad1337fa591e2afc692cc2941122f071e953c7a497c017fd429c46",
  "leave_requests.get": "9ced403622c439f131d7b6fb17d9c7e0ac1113a8ad560988099fb0a5bb847a05",
  "goals.list": "254cb9f30fcc8426c436b41e48d5e4a4ff0c60786538fe70e7def1fb2918163d",
  "projects.list": "9a098d25107c16ba5b6d981d634ddde90d8f5e2c772e0d98af1b60e21e7a7866",
};

const RECIPE_SHA256 = "0e7e24baf0660c27656e1a1379aa19e5237c813699d1ebb3a04a5df4a55631f1";

describe("hr-partner manifest", () => {
  test("bumps the patch and keeps header api-key auth on api.hrpartner.io", () => {
    expect(manifest.key).toBe("hr-partner");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.hrpartner.io");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.hrpartner.io"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal", () => {
    expect(Object.keys(operations)).toHaveLength(24);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(22);
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
  });

  test("adds the two documented JSON GET routes without a body or Content-Type", () => {
    const added: Record<string, string> = {
      "expenses.list": "/expenses",
      "performances.list": "/performances",
    };
    for (const [key, path] of Object.entries(added)) {
      const operation = operations[key];
      const request = operation?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe("GET");
      expect(request.path, key).toBe(path);
      expect(request.body, key).toBeUndefined();
      expect(request.headers, key).toBeUndefined();
      expect(request.success, key).toEqual([200]);
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.outputSchema.properties.data.type, key).toBe("array");
      expect(String(request.path), key).not.toMatch(/[{}]/);
    }
    const paths = Object.values(operations).map((op) => op.request?.path);
    expect(paths.filter((path) => path === "/expenses" || path === "/expenses/")).toHaveLength(1);
    expect(paths.filter((path) => path === "/performances" || path === "/performances/")).toHaveLength(1);
    for (const skipped of ["recruitment.get", "employee-records.list", "leave.list", "recruitment.search"]) {
      expect(operations[skipped], skipped).toBeUndefined();
    }
  });

  test("bounds every action", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.kind, key).toBe("action");
      expect(String(op.request.path), key).not.toContain("wss");
      expect(String(op.request.path), key).not.toContain("http://");
      const method = String(op.request.method);
      const headers = op.request.headers ?? {};
      if (method === "GET" || method === "DELETE" || op.request.body === undefined) {
        expect(op.request.body, key).toBeUndefined();
        expect(headers["Content-Type"], key).toBeUndefined();
      }
    }
  });

  test("copies the origin recipe unchanged and leaves new keys as a recipe gap", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/hr_partner/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations)).toEqual(Object.keys(ORIGIN_SHA256));
    expect(recipe.manifest.operations["expenses.list"]).toBeUndefined();
    expect(recipe.manifest.operations["performances.list"]).toBeUndefined();
  });
});
