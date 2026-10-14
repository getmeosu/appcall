// L2-27: the documented GraphQL operations from the Composio missing_http
// backlog, implemented as declarative {query, variables} requests against the
// single documented POST /v2 endpoint. Fixture-only: every request goes to an
// injected fetch; nothing reaches monday.com.
import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../monday.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const { actions } = compileDeclarativeConnector(manifest as never);

// [Composio tool slug, AppCall operation, documented GraphQL field, keyword]
const batch: Array<[string, string, string, "query" | "mutation"]> = [
  ["MONDAY_ACCOUNT_TRIGGER_STATISTICS", "account.triggerStatistics", "account_trigger_statistics", "query"],
  ["MONDAY_ADD_SUBSCRIBERS_TO_OBJECT", "objects.addSubscribers", "add_subscribers_to_object", "mutation"],
  ["MONDAY_AGGREGATE_DATA", "aggregate.get", "aggregate", "query"],
  ["MONDAY_ARCHIVE_OBJECT", "objects.archive", "archive_object", "mutation"],
  ["MONDAY_CONNECTIONS", "connections.list", "connections", "query"],
  ["MONDAY_DELETE_OBJECT", "objects.delete", "delete_object", "mutation"],
  ["MONDAY_DELETE_TEAM", "team.delete", "delete_team", "mutation"],
  ["MONDAY_GET_API_VERSION", "version.get", "version", "query"],
  ["MONDAY_PUBLISH_OBJECT", "objects.publish", "publish_object", "mutation"],
  ["MONDAY_UNPUBLISH_OBJECT", "objects.unpublish", "unpublish_object", "mutation"],
  ["MONDAY_UPDATE_EMAIL_DOMAIN", "users.updateEmailDomain", "update_email_domain", "mutation"],
  ["MONDAY_UPDATE_MULTIPLE_USERS", "users.updateMultiple", "update_multiple_users", "mutation"],
  ["MONDAY_USER_CONNECTIONS", "userConnections.list", "user_connections", "query"],
];

describe("monday L2 depth batch", () => {
  it("accounts for all 126 tools exactly once with no missing_http", () => {
    const tools = [...coverage.mapped, ...coverage.missing_http, ...coverage.missing_still].map((row) => row.tool);
    expect(coverage.composio_tools).toBe(126);
    expect(coverage.full_depth).toBe(true);
    expect(coverage.missing_http).toEqual([]);
    expect(tools).toHaveLength(126);
    expect(new Set(tools).size).toBe(126);
  });

  it("maps the batch tools to the documented GraphQL operations", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation, field, keyword] of batch) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(definition, operation).toBeDefined();
      expect(definition.kind).toBe("action");
      expect(definition.request.method, operation).toBe("POST");
      expect(definition.request.path, operation).toBe("/v2");
      expect(definition.request.success, operation).toEqual([200]);
      expect(typeof actions[operation], operation).toBe("function");
      const query = String(definition.request.body.query);
      expect(query.startsWith(keyword), `${operation} document kind`).toBe(true);
      expect(new RegExp(`\\b${field}\\b`).test(query), `${operation} calls ${field}`).toBe(true);
      expect(query).not.toContain("{{");
      expect(definition.sideEffect).toBe(keyword === "mutation" ? "write" : "read");
    }
  });

  it("replays the batch fixtures through the compiled actions", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs).toHaveLength(batch.length);
    for (const run of runs) {
      if (run.status !== "passed") throw new Error(`${run.caseId}: ${run.error}`);
    }
    const positive = new Set(cases.filter((entry) => entry.expected.kind === "success").map((entry) => entry.operation));
    for (const [, operation] of batch) expect(positive.has(operation), operation).toBe(true);
  });

  it("keeps the multipart asset upload as an evidence-backed exclusion", () => {
    const row = coverage.missing_still.find((entry) => entry.tool === "MONDAY_UPLOAD_ASSET");
    expect(row).toBeDefined();
    // POST /v2/file is the GraphQL multipart request spec (add_file_to_column /
    // add_file_to_update with a File! scalar); the declarative runner sends
    // JSON, form, or raw bodies, so there is no public JSON route to declare.
    expect(row!.why).toBe(
      "reason=no_public_json_route; evidence=https://developer.monday.com/api-reference/reference/assets-1,https://docs.composio.dev/toolkits/monday.md; fetched=2026-10-14",
    );
    expect(coverage.missing_http.some((entry) => entry.tool === "MONDAY_UPLOAD_ASSET")).toBe(false);
  });
});
