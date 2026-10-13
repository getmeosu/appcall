import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";
import coreFixtures from "../fixtures/core_success.json";
import expandedFixtures from "../fixtures/expanded_api_methods.json";
import { slackCoreActionHandlers } from "../src/core_actions";

const caseDir = join(import.meta.dir, "../fixtures/cases");
const legacyCovered = new Set([...Object.keys(coreFixtures), ...Object.keys(expandedFixtures)]);
const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  title?: string;
  description?: string;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  validationMode?: string;
  responseFormat?: string;
  enforceOutputSchema?: boolean;
  request?: { method?: string; bodyEncoding?: string };
}>;

/** Operations added by the L2 depth backlog: declarative requests without legacy fixtures. */
const depthOperations = Object.entries(operations)
  .filter(([key, operation]) => operation.request !== undefined && !legacyCovered.has(key))
  .map(([key]) => key);

/** Slack methods that mutate even though the documented verb is GET. */
const mutatingGets = new Set([
  "admin.emoji.add",
  "admin.emoji.addAlias",
  "admin.emoji.remove",
  "admin.emoji.rename",
  "admin.teams.settings.setDefaultChannels",
  "admin.teams.settings.setIcon",
  "users.deletePhoto",
]);

const destructiveOperations = [
  "admin.conversations.delete",
  "admin.emoji.remove",
  "admin.users.remove",
  "admin.users.session.reset",
  "stars.remove",
  "users.deletePhoto",
];

describe("Slack L2 depth operations", () => {
  it("replays every depth fixture case", async () => {
    const cases = loadFixtureCases(caseDir);
    expect(cases.length).toBeGreaterThanOrEqual(depthOperations.length);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every depth operation with a positive fixture", () => {
    const positive = new Set(
      readdirSync(caseDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => JSON.parse(readFileSync(join(caseDir, name), "utf8")) as { operation: string; expected?: { kind?: string } })
        .filter((entry) => entry.expected?.kind === "success")
        .map((entry) => entry.operation),
    );
    expect([...positive].sort()).toEqual([...depthOperations].sort());
  });

  it("keeps the registered runtime handlers on the same request contract as the fixtures", async () => {
    // The loader prefers the registered core handlers over the compiled ones, so
    // the runtime path must build the same form/query request as the fixtures.
    for (const name of readdirSync(caseDir).filter((entry) => entry.endsWith(".json")).sort()) {
      const fixture = JSON.parse(readFileSync(join(caseDir, name), "utf8")) as {
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{ request: { method: string; url: string; body: string | null } }>;
      };
      const exchange = fixture.exchanges[0]!;
      let captured: Request | undefined;
      await slackCoreActionHandlers[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (input, init) => {
          captured = new Request(input, init);
          return Response.json({ ok: true });
        },
      });
      expect(captured?.method, fixture.operation).toBe(exchange.request.method);
      expect(captured?.url, fixture.operation).toBe(exchange.request.url);
      expect(await captured?.text(), fixture.operation).toBe(exchange.request.body ?? "");
    }
  });

  it("declares bounded strict-generated metadata for every depth operation", () => {
    expect(depthOperations.length).toBe(55);
    for (const key of depthOperations) {
      const operation = operations[key]!;
      expect(operation.kind, key).toBe("action");
      expect(operation.title, key).toBeTruthy();
      expect(operation.description, key).toBeTruthy();
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      if (operation.request?.method === "GET" && !mutatingGets.has(key)) {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
    const destructive = depthOperations.filter((key) => operations[key]!.sideEffect === "destructive");
    expect(destructive.sort()).toEqual([...destructiveOperations].sort());
  });
});
