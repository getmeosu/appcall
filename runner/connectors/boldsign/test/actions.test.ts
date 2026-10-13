import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);
const { actions } = compileDeclarativeConnector(manifest);

describe("BoldSign depth fixtures", () => {
  it("compiles every HTTP action and skips EventOnly webhooks", () => {
    expect(Object.keys(actions).sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(actions[key]).toBeUndefined();
        expect((manifest.operations as Record<string, { kind?: string }>)[key].kind).toBe("webhook");
        expect((manifest.operations as Record<string, { sideEffect?: string }>)[key].sideEffect).toBe("read");
      }
    }
  });

  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });

  it("keeps origin brands.get and adds the documented JSON routes", () => {
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.http.baseUrl).toBe("https://api.boldsign.com");
    expect(manifest.network.allowedHosts).toEqual(["api.boldsign.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-KEY",
      value: "{{apiKey}}",
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Authorization");
    expect(JSON.stringify(manifest.network.allowedHosts)).not.toContain("api-eu.boldsign.com");

    const operations = manifest.operations as Record<string, {
      request: { method: string; path: string; body?: unknown; headers?: Record<string, string>; success: number[] };
    }>;
    expect(Object.keys(operations)).toHaveLength(26);
    expect(operations["brands.get"]!.request).toMatchObject({ method: "GET", path: "/v1/brand/getbrand" });
    expect(operations["brands.get"]!.request.body).toBeUndefined();
    expect(operations["brands.get"]!.request.headers).toBeUndefined();

    const added: Record<string, { method: string; path: string; success: number[]; body: boolean }> = {
      "brands.getDetails": { method: "GET", path: "/v1/brand/get", success: [200], body: false },
      "customFields.create": { method: "POST", path: "/v1/customField/create", success: [200], body: true },
      "customFields.edit": { method: "POST", path: "/v1/customField/edit", success: [200], body: true },
      "documents.behalfList": { method: "GET", path: "/v1/document/behalfList", success: [200], body: false },
      "documents.edit": { method: "PUT", path: "/v1/document/edit", success: [200], body: true },
      "embeddedRequests.createLink": { method: "POST", path: "/v1/document/createEmbeddedRequestUrl", success: [200], body: true },
    };
    for (const [key, spec] of Object.entries(added)) {
      const request = operations[key]!.request;
      expect(request.method).toBe(spec.method);
      expect(request.path).toBe(spec.path);
      expect(request.success).toEqual(spec.success);
      expect(request.body !== undefined).toBe(spec.body);
      expect(request.headers?.["Content-Type"]).toBe(spec.body ? "application/json" : undefined);
      expect(JSON.stringify(request)).not.toContain("multipart");
      expect(JSON.stringify(request.path)).not.toContain("extendExpiry");
      expect(JSON.stringify(request.path)).not.toContain("RemoveAuthentication");
    }
  });
});
