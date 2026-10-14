import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  request?: { method?: string; path?: string; success?: number[]; headers?: Record<string, string> };
  sideEffect?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  responseFormat?: string;
}>;

const declarativeActionKeys = Object.entries(operations)
  .filter(([, operation]) => operation.kind === "action" && operation.request !== undefined)
  .map(([key]) => key);

describe("klaviyo declarative depth fixtures", () => {
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

  it("covers every declarative action with a positive fixture", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...declarativeActionKeys].sort());
  });
});

describe("klaviyo L2 missing_http backlog", () => {
  const backlog: Array<[string, string, number[], string]> = [
    ["campaigns.create", "POST", [201, 200], "write"],
    ["flows.create", "POST", [201], "write"],
    ["lists.create", "POST", [201, 200], "write"],
    ["contacts.create", "POST", [201, 200], "write"],
    ["campaigns.get", "GET", [200], "read"],
    ["catalog.items.get", "GET", [200], "read"],
    ["catalog.items.list", "GET", [200], "read"],
    ["events.get", "GET", [200], "read"],
    ["events.list", "GET", [200], "read"],
    ["events.relationships.get", "GET", [200], "read"],
    ["flows.list", "GET", [200], "read"],
    ["lists.get", "GET", [200], "read"],
    ["metrics.get", "GET", [200], "read"],
    ["metrics.list", "GET", [200], "read"],
    ["profiles.get", "GET", [200], "read"],
    ["profiles.relationships.get", "GET", [200], "read"],
    ["segments.get", "GET", [200], "read"],
    ["segments.list", "GET", [200], "read"],
    ["segments.relationships.get", "GET", [200], "read"],
    ["tags.relationships.get", "GET", [200], "read"],
    ["templates.get", "GET", [200], "read"],
    ["templates.list", "GET", [200], "read"],
    ["translations.list", "GET", [200], "read"],
    ["campaigns.update", "PATCH", [200], "write"],
    ["profiles.update", "PATCH", [200], "write"],
  ];

  it("declares the 25 implementable rows as strict declarative actions", () => {
    for (const [key, method, success, sideEffect] of backlog) {
      const op = operations[key];
      expect(op, key).toBeTruthy();
      expect(op.kind, key).toBe("action");
      expect(op.sideEffect, key).toBe(sideEffect);
      expect(op.request?.method, key).toBe(method);
      expect(op.request?.path?.startsWith("/api/"), key).toBe(true);
      expect(op.request?.success, key).toEqual(success);
      expect(op.validationMode, key).toBe("strict-generated");
      expect(op.enforceOutputSchema, key).toBe(true);
      expect(op.responseFormat, key).toBe("json");
      expect(declarativeActionKeys, key).toContain(key);
    }
  });

  it("keeps the multipart image upload on the hand-written handler", () => {
    const op = operations["images.uploadFromFile"];
    expect(op.kind).toBe("action");
    expect(op.request).toBeUndefined();
    const src = readFileSync(join(import.meta.dir, "../src/parity_actions.ts"), "utf8");
    expect(src).toContain("images.uploadFromFile");
    expect(src).toContain("FormData");
  });

  it("sends the beta revision header for translations only", () => {
    expect(operations["translations.list"].request?.headers).toEqual({ revision: "2026-07-15.pre" });
    for (const key of declarativeActionKeys) {
      if (key === "translations.list") continue;
      expect(operations[key].request?.headers?.revision, key).toBeUndefined();
    }
  });
});
