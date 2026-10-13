import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

// The operations added for the Composio parity backlog (L2-10). The pre-parity
// surface keeps its legacy flat fixtures under fixtures/*.json; these
// replayable cases are the evidence for the parity operations.
const parityOperations = [
  "activities.list",
  "backups.list",
  "filters.list",
  "idMappings.resolve",
  "labels.listShared",
  "labels.search",
  "projects.inviteCollaborator",
  "projects.permissions",
  "sections.listArchived",
  "sections.search",
  "settings.updateNotification",
  "stats.productivity",
  "sync",
  "tasks.bulkCreate",
  "tasks.completedByCompletionDate",
  "tasks.completedByDueDate",
  "tasks.reorder",
  "templates.exportUrl",
  "templates.importIntoProject",
  "workspaces.create",
  "workspaces.listActiveProjects",
  "workspaces.listAllInvitations",
  "workspaces.listArchivedProjects",
  "workspaces.listInvitations",
  "workspaces.listJoinable",
  "workspaces.listUsers",
  "workspaces.planDetails",
].sort();

function cases() {
  return loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
}

describe("todoist parity fixtures", () => {
  it("covers every parity operation with at least one positive case", () => {
    const positive = [...new Set(
      cases()
        .filter((fixture) => fixture.expected.kind === "success")
        .map((fixture) => fixture.operation),
    )].sort();
    expect(positive).toEqual(parityOperations);
  });

  it("declares every parity operation in the manifest", () => {
    const declared = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key)
      .sort();
    for (const operation of parityOperations) {
      expect(declared).toContain(operation);
    }
  });

  it("replays every recorded fixture case against the manifest", async () => {
    const loaded = cases();
    const runs = await runCandidateFixtures(JSON.stringify(manifest), loaded);
    expect(runs.length).toBe(loaded.length);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("records negative cases for the shared failure paths", () => {
    const negative = cases().filter((fixture) => fixture.expected.kind === "error");
    expect(negative.length).toBeGreaterThanOrEqual(3);
  });
});
