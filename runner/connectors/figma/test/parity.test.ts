import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import manifest from "../manifest.json";

// The operations added for the Composio parity backlog. The pre-parity surface
// keeps its legacy flat fixtures under fixtures/*.json; these replayable cases
// are the evidence for the parity operations.
const parityOperations = [
  "activityLogs.list",
  "analytics.componentActions",
  "analytics.componentUsages",
  "analytics.styleActions",
  "analytics.styleUsages",
  "analytics.variableActions",
  "analytics.variableUsages",
  "devResources.update",
  "payments.get",
  "team.listComponentSets",
  "variables.listPublished",
  "variables.modify",
  "webhooks.create",
  "webhooks.delete",
  "webhooks.get",
  "webhooks.list",
  "webhooks.listRequests",
  "webhooks.update",
].sort();

function cases() {
  return loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
}

describe("figma parity fixtures", () => {
  it("covers every parity operation with exactly one positive case", () => {
    const positive = cases()
      .filter((fixture) => fixture.expected.kind === "success")
      .map((fixture) => fixture.operation)
      .sort();
    expect(positive).toEqual(parityOperations);
  });

  it("replays every authenticated fixture case against the manifest", async () => {
    const loaded = cases();
    const runs = await runCandidateFixtures(JSON.stringify(manifest), loaded);
    expect(runs.length).toBe(parityOperations.length);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });
});
