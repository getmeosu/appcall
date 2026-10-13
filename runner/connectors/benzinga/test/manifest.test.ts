import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const ORIGIN_SHA256: Record<string, string> = {
  "healthcheck": "083df3bf13f65e5ff1d20108e2a07aee51b97e73778e990c8c7f39d2607daa4d",
  "news.channels.list": "5a12a3b4b86658055ddead0fccafc54bad403553accf5b10e1c5f5b40448cbf0",
  "earnings.list": "82330ea1eca8493e9ca62c3130c663452a63c740d3e860dc04f420a51b3dacec",
  "ratings.list": "48a4e96d3e9cd1e9257e30233a90b659414dfe30d7f7a52b6c22a56647894cf5",
  "consensus.ratings.get": "cda70ccb5c1fb77fb1c0cad681c68d301e1c1683e94716958e21bf9b14346eb2",
  "news.list": "cce76feb222c52a62923b6df66ce63084ded17c450d2365b26a3ba334de781bd",
  "news.get": "a8bd164547088fb202bd3ecdaf4f65050e14beec6d954fc0692f450f00b544eb",
  "dividends.list": "8170ddf9b865b2891a9207bb7c55ad285129563c874af9d05bd1e71ea3b654a6",
  "conferenceCalls.list": "40f456195533c8191647d1110d637d8cf7d5d69e2889d03382426599069d7e75",
  "guidance.list": "de63d6f7529d53e086339c9a61841b390a3dcdd404fa6df10d0a66259efc8be4",
  "ipos.list": "bb4892eee916bb0c6471c82076863e2cc0ce0fb0fcfeea5f50d437eefc332b31",
  "splits.list": "977c8c2ab842dda5cfb004820466e56c9256189679efadbbd52499ae28585976",
  "economics.list": "6f498db2221d6e3359a542565b2b1be041d8d1d44015af671036b546c324c2b5",
  "ma.list": "d9d32d117310e030a50a8b75303fe621ed69d95e85bd43d6e5916b2def417674",
  "offerings.list": "f8207f72d739f2c49a4f9b2a13301f98b047bc915ed2cc9bbdee454ab9714a30",
  "events.list": "dd043e2a8249079aebe57ac0bdebbc25fc040af3bda35268cdff43bbef13127f",
  "fda.list": "7b543ca502bbfd4002ba1cc18aa38744b177e8b83fc63e2a0ee49667a483073b",
  "ratings.analysts.list": "bb1d5fcad6f2451977c99090ddbcd66e740ded66285ed7a3162c1ae7279514c0",
  "ratings.firms.list": "6d19509d875d5fe15e6f328e17ab306dafa98ec5f9794562a224c074d9f454a8",
  "bullsBears.get": "7cf410cd7042d61c2f52aa4d82f9d2ad4d8888dd10e813458f701a3d1de5ea92"
};

const RECIPE_SHA256 = "7cbb70de5b3ad33e89b4906e577ac08e87d6241496e08e1ba98a435d85f799da";

describe("benzinga manifest", () => {
  test("bumps the patch and keeps query-token auth on api.benzinga.com", () => {
    expect(manifest.key).toBe("benzinga");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.full_depth).toBeUndefined();
    expect(manifest.http.baseUrl).toBe("https://api.benzinga.com");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "query",
      name: "token",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.benzinga.com"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps every origin operation byte-equal", () => {
    expect(Object.keys(operations)).toHaveLength(22);
    expect(Object.keys(ORIGIN_SHA256)).toHaveLength(20);
    for (const [key, sha] of Object.entries(ORIGIN_SHA256)) {
      expect(operations[key], key).toBeDefined();
      const encoded = JSON.stringify(operations[key], null, 2);
      expect(createHash("sha256").update(encoded).digest("hex"), key).toBe(sha);
    }
  });

  test("adds the two documented JSON GET routes without a body or Content-Type", () => {
    const added: Record<string, string> = {
      "news.removed.list": "/api/v2/news-removed",
      "calendar.removed.list": "/api/v2.1/calendar-removed",
    };
    for (const [key, path] of Object.entries(added)) {
      const request = operations[key]?.request;
      expect(request, key).toBeDefined();
      expect(request.method, key).toBe("GET");
      expect(request.path, key).toBe(path);
      expect(request.body, key).toBeUndefined();
      expect(request.headers, key).toBeUndefined();
      expect(request.success, key).toEqual([200]);
      expect(operations[key].sideEffect, key).toBe("read");
      expect(operations[key].responseFormat, key).toBe("json");
      expect(String(request.path), key).not.toMatch(/\{\{/);
    }
    const paths = Object.values(operations).map((op) => op.request?.path);
    expect(paths.filter((path) => path === "/api/v2/news-removed")).toHaveLength(1);
    expect(paths.filter((path) => path === "/api/v2.1/calendar-removed" || path === "/api/v2.1/calendar-removed/")).toHaveLength(1);
  });

  test("bounds every action", () => {
    for (const [key, op] of Object.entries(operations)) {
      expect(op.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(op.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(op.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(op.maxResponseBytes, key).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.kind, key).toBe("action");
      const headers = op.request.headers ?? {};
      expect(op.request.body, key).toBeUndefined();
      expect(headers["Content-Type"], key).toBeUndefined();
      expect(String(op.request.path), key).not.toContain("wss");
    }
  });

  test("copies the origin recipe unchanged and leaves new keys as a recipe gap", () => {
    const bytes = readFileSync(new URL("../../../../scripts/connector-gen/openconnector/recipes/benzinga/recipe.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RECIPE_SHA256);
    const recipe = JSON.parse(bytes.toString("utf8"));
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations)).toEqual(Object.keys(ORIGIN_SHA256));
    expect(recipe.manifest.operations["news.removed.list"]).toBeUndefined();
    expect(recipe.manifest.operations["calendar.removed.list"]).toBeUndefined();
  });
});
