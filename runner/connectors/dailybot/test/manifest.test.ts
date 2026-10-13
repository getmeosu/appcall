import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const ORIGIN_SHA256: Record<string, string> = {
  healthcheck: "a8e7c592e5c98ba0d829384cc2fa529ca9fd2e469658b5a51ac33a7475359674",
  "me.get": "5a7506b6756f1f9af6e37868c0de4d57fcfab6e9b343f6ad25c7f60b0ddc7fbf",
  "organization.get": "22db291d5e84a97254b7863e27a0b27cc4a5c1511d57daeb2ebdf47cc55400f5",
  "users.list": "818eb7f3f8e0c084ee5b4d0e314cda14a28a1b3aef4b4ee7743b918831329666",
  "users.get": "6c3eb67081995e46e36f2bf73dc6be86a18895a480e1f84761af22501b20bbba",
  "teams.list": "47b63f63621e8f9088a488af84266619561c1c6bb731b4e16e6ef7629042aa9a",
  "teams.get": "831fa9fba34a343d02121309f556738ebe1f2b962f3abc7b85819cd0d19bcccd",
  "teams.members.list": "913b10b7600bc64b21bcfd49db0dd21362570e3fa2ef75e33c3a3cf79d8e14f6",
  "teams.members.add": "2b46052e3b6491a4e63d797ccf78c69f064289ec987c2644d082e2787d73209a",
  "teams.members.remove": "2025c67227242eaf9b29b791a0dac811a99568ef0cd2cfbda723341390a42891",
  "checkins.list": "9e07bfc46f679ed2d8d34e8d824c0a7df9be19fb7952af3e7b9ee604286bcc2c",
  "checkins.get": "906095b526ad6d0c8d91cc64ab0e34cd4e75bb5471ad8bb4ece858f2a8674afc",
  "checkins.create": "d92e1dde3769e66bf3b7ee6772384033ee3dac8a11c1b381462ce5c5b6a3c657",
  "checkins.responses.list": "0e16efeb613efb0b724244c34660947bfcb6f6c4d0e76a8db5383412b1a25e6f",
  "forms.list": "f49b7c4acb9243c97d9615036157b58475d75a99467f15558bc29bcb490cde1e",
  "forms.get": "df2ca57b92f25a6ee252317b16ecce84859c8e086ed22bf5cb5c560a682198d1",
  "forms.responses.create": "a27157d18b9a9d2d70b2ebfab9a84622b8f9498669a31a9ca4e8b47bf42c9960",
  "kudos.list": "67c77ec9b102825b1ae6f18bf34d38b21e5049f9bd75d7d73cbefb8d9e877a36",
  "kudos.create": "55e3c9aa5b72673b1254c6a268f7a0efb59bf8574d3c156457e2af596ff3d3b7",
  "templates.list": "275f4256f28513e3cacf4fe26a9d99bc68d68c0a39e5ab57ae907036adef6efd",
};

const RECIPE_SHA256 = "f081488dd7d9e6ec8ea1fa74eaf08ec4811904ae1d3bb3e55fc3088b11be9a30";

const ADDED = {
  DAILYBOT_CREATE_CHECKIN: {
    method: "POST",
    path: "/v1/checkins/",
    success: [201],
    body: true,
  },
  DAILYBOT_FIND_WORKFLOW: {
    method: "GET",
    path: "/v1/workflows/",
    success: [200],
    body: false,
  },
  DAILYBOT_SEND_MESSAGE: {
    method: "POST",
    path: "/v1/send-message/",
    success: [200],
    body: true,
  },
} as const;

describe("dailybot manifest", () => {
  test("bumps only the patch and keeps X-API-KEY auth on api.dailybot.com", () => {
    expect(manifest.key).toBe("dailybot");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.dailybot.com");
    expect(manifest.http.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-KEY",
      value: "{{apiKey}}",
    });
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.network.allowedHosts).toEqual(["api.dailybot.com"]);
    expect(String(manifest.http.baseUrl).startsWith("https://")).toBe(true);
    expect(manifest.http.baseUrl).not.toContain("{{");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal, including users and kudos", () => {
    expect(Object.keys(operations)).toHaveLength(23);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(20);
    expect(Object.keys(operations).slice(0, 20)).toEqual(Object.keys(ORIGIN_SHA256));
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
    expect(operations["users.list"].request).toMatchObject({
      method: "GET",
      path: "/v1/users/",
    });
    expect(operations["users.get"].request).toMatchObject({
      method: "GET",
      path: "/v1/users/{{user_uuid}}/",
    });
    expect(operations["kudos.create"].request).toMatchObject({
      method: "POST",
      path: "/v1/kudos/",
    });
    expect(operations["checkins.create"].request.path).toBe("/v1/checkins/create/");
  });

  test("adds the three documented JSON routes and not the no-slash duplicates", () => {
    for (const [key, spec] of Object.entries(ADDED)) {
      const operation = operations[key];
      const request = operation?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe(spec.method);
      expect(request.path, key).toBe(spec.path);
      expect(request.success, key).toEqual([...spec.success]);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.outputSchema.properties.data.type, key).toBe("object");
      expect(operation.title?.trim(), key).toBeTruthy();
      expect(operation.description?.trim(), key).toBeTruthy();
      expect(operation.inputSchema.type, key).toBe("object");
      expect(operation.inputSchema.additionalProperties, key).toBe(false);
      expect(String(request.path), key).not.toMatch(/[{}]/);
      if (spec.body) {
        expect(request.body, key).toBeTypeOf("object");
        expect(request.headers, key).toEqual({ "Content-Type": "application/json" });
        expect(operation.sideEffect, key).toBe("write");
      } else {
        expect(request.body, key).toBeUndefined();
        expect(request.headers, key).toBeUndefined();
        expect(operation.sideEffect, key).toBe("read");
      }
    }
    expect(operations.DAILYBOT_CREATE_CHECKIN.inputSchema.required).toEqual(["name", "template"]);
    expect(operations.DAILYBOT_CREATE_CHECKIN.request.body.name).toBe("{{name}}");
    expect(operations.DAILYBOT_CREATE_CHECKIN.request.body.template).toBe("{{template}}");
    expect(operations.DAILYBOT_FIND_WORKFLOW.request.query.search).toBe("{{search}}");
    expect(operations.DAILYBOT_SEND_MESSAGE.request.body.message).toBe("{{message}}");
    expect(operations.DAILYBOT_SEND_MESSAGE.request.body.target_channels).toBe("{{target_channels}}");
    expect(operations.DAILYBOT_SEND_MESSAGE.inputSchema.properties.exchange_token).toBeUndefined();

    const paths = Object.values(operations).map((op) => `${op.request.method} ${op.request.path}`);
    expect(paths.filter((path) => path === "POST /v1/checkins/")).toHaveLength(1);
    expect(paths.filter((path) => path === "POST /v1/checkins")).toHaveLength(0);
    expect(paths.filter((path) => path === "GET /v1/workflows/")).toHaveLength(1);
    expect(paths.filter((path) => path === "GET /v1/workflows")).toHaveLength(0);
    expect(paths.filter((path) => path === "POST /v1/send-message/")).toHaveLength(1);
    expect(paths.filter((path) => path === "POST /v1/send-message")).toHaveLength(0);
  });

  test("bounds every action and keeps GET body-less without a request Content-Type", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.kind, key).toBe("action");
      expect(op.responseFormat, key).toBe("json");
      expect(String(op.request.path), key).not.toContain("wss");
      expect(String(op.request.path).startsWith("http://"), key).toBe(false);
      expect(String(op.request.path).startsWith("/"), key).toBe(true);
      const method = String(op.request.method);
      const headers = op.request.headers ?? {};
      if (method === "GET" || method === "DELETE") {
        expect(op.request.body, key).toBeUndefined();
        expect(headers["Content-Type"], key).toBeUndefined();
      } else if (op.request.body !== undefined && op.request.headers) {
        expect(headers["Content-Type"], key).toBe("application/json");
      }
    }
  });

  test("copies the origin recipe unchanged and leaves new keys as a recipe gap", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/dailybot/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations)).toEqual(Object.keys(ORIGIN_SHA256));
    for (const key of Object.keys(ADDED)) {
      expect(recipe.manifest.operations[key], key).toBeUndefined();
    }
  });
});
