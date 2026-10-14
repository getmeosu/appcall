import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

const declarativeActionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => {
    const op = operation as { kind?: string; request?: unknown };
    return op.kind === "action" && op.request !== undefined;
  })
  .map(([key]) => key);

describe("ashby declarative depth fixtures", () => {
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
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });

  it("declares the L2 missing_http backlog as POST JSON operations", () => {
    const backlog = [
      "interviewer_pools.add_user",
      "candidates.anonymize",
      "offers.approve",
      "departments.archive",
      "interviewer_pools.archive",
      "locations.archive",
      "custom_fields.create",
      "departments.create",
      "interviewer_pools.create",
      "locations.create",
      "survey_requests.create",
      "survey_submissions.create",
      "interviewer_pools.get",
      "users.get_interviewer_settings",
      "survey_form_definitions.get",
      "approvals.list",
      "brands.list",
      "candidates.list_client_info",
      "interviewer_pools.list",
      "job_boards.list",
      "source_tracking_links.list",
      "survey_form_definitions.list",
      "survey_submissions.list",
      "departments.move",
      "locations.move",
      "interviewer_pools.remove_user",
      "departments.restore",
      "interviewer_pools.restore",
      "locations.restore",
      "applications.update_history",
      "jobs.update_compensation",
      "departments.update",
      "interviewer_pools.update",
      "locations.update_address",
      "locations.update_external_name",
      "locations.update_name",
      "locations.update_workplace_type",
      "custom_fields.update_selectable_values",
      "users.update_interviewer_settings",
    ];
    expect(backlog).toHaveLength(39);
    for (const key of backlog) {
      const op = (manifest.operations as Record<string, any>)[key];
      expect(op).toBeTruthy();
      expect(op.kind).toBe("action");
      expect(op.request.method).toBe("POST");
      expect(op.request.success).toEqual([200]);
      expect(op.request.body).toBeDefined();
      expect(op.validationMode).toBe("strict-generated");
      expect(op.enforceOutputSchema).toBe(true);
      expect(op.responseFormat).toBe("json");
    }
    const readKeys = new Set([
      "interviewer_pools.get",
      "users.get_interviewer_settings",
      "survey_form_definitions.get",
      "approvals.list",
      "brands.list",
      "candidates.list_client_info",
      "interviewer_pools.list",
      "job_boards.list",
      "source_tracking_links.list",
      "survey_form_definitions.list",
      "survey_submissions.list",
    ]);
    for (const key of backlog) {
      const op = (manifest.operations as Record<string, any>)[key];
      expect(op.sideEffect).toBe(readKeys.has(key) ? "read" : "write");
    }
    for (const key of ["approvals.list", "brands.list", "candidates.list_client_info", "interviewer_pools.list", "source_tracking_links.list", "survey_form_definitions.list", "survey_submissions.list"]) {
      const op = (manifest.operations as Record<string, any>)[key];
      expect(op.inputSchema.properties.cursor).toBeDefined();
      expect(op.description).toContain("cursor");
    }
  });
});
