import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../mixpanel.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);

// Live MIXPANEL toolkit inventory, source=https://docs.composio.dev/toolkits/mixpanel.md; fetched=2026-10-14.
const liveTools = [
  "MIXPANEL_ADD_UNIQUE_TO_PROFILE_LIST_PROPERTY",
  "MIXPANEL_AGGREGATED_EVENT_PROPERTY_VALUES",
  "MIXPANEL_AGGREGATE_EVENTS",
  "MIXPANEL_AGGREGATE_EVENT_COUNTS",
  "MIXPANEL_COHORTS_LIST",
  "MIXPANEL_CREATE_ANNOTATION_TAG",
  "MIXPANEL_CREATE_IDENTITY",
  "MIXPANEL_CREATE_SERVICE_ACCOUNT",
  "MIXPANEL_DELETE_GROUP",
  "MIXPANEL_DELETE_PROFILE",
  "MIXPANEL_DELETE_PROFILE_BATCH",
  "MIXPANEL_DELETE_PROFILE_PROPERTY",
  "MIXPANEL_GET_ALL_PROJECTS",
  "MIXPANEL_GET_ANNOTATION_TAGS_ALT1",
  "MIXPANEL_GROUP_BATCH_UPDATE",
  "MIXPANEL_GROUP_DELETE_PROPERTY",
  "MIXPANEL_GROUP_SET_PROPERTY",
  "MIXPANEL_IDENTITY_CREATE_ALIAS",
  "MIXPANEL_JQL_QUERY",
  "MIXPANEL_LIST_COHORTS",
  "MIXPANEL_LIST_FUNNELS",
  "MIXPANEL_LIST_SAVED_COHORTS",
  "MIXPANEL_LIST_SERVICE_ACCOUNTS",
  "MIXPANEL_PROFILE_APPEND_TO_LIST_PROPERTY",
  "MIXPANEL_PROFILE_BATCH_UPDATE",
  "MIXPANEL_PROFILE_DELETE_PROPERTY",
  "MIXPANEL_PROFILE_EVENT_ACTIVITY",
  "MIXPANEL_PROFILE_NUMERICAL_ADD",
  "MIXPANEL_PROFILE_REMOVE_FROM_LIST_PROPERTY",
  "MIXPANEL_PROFILE_SET",
  "MIXPANEL_QUERY_FREQUENCY_REPORT",
  "MIXPANEL_QUERY_FUNNEL",
  "MIXPANEL_QUERY_INSIGHT",
  "MIXPANEL_QUERY_MONTHS_TOP_EVENT_NAMES",
  "MIXPANEL_QUERY_NUMERIC_AVERAGE",
  "MIXPANEL_QUERY_NUMERIC_SUM",
  "MIXPANEL_QUERY_PROFILES",
  "MIXPANEL_QUERY_RETENTION_REPORT",
  "MIXPANEL_QUERY_SEGMENTATION",
  "MIXPANEL_QUERY_TOP_EVENTS",
  "MIXPANEL_REMOVE_FROM_GROUP_LIST_PROPERTY",
  "MIXPANEL_REMOVE_FROM_LIST_PROPERTY",
  "MIXPANEL_SEGMENTATION_NUMERIC_QUERY",
  "MIXPANEL_SET_GROUP_PROPERTY_ONCE",
  "MIXPANEL_SET_PROFILE_PROPERTY_ONCE",
  "MIXPANEL_TODAYS_TOP_EVENTS",
  "MIXPANEL_TOP_EVENTS",
  "MIXPANEL_TOP_EVENT_PROPERTIES",
  "MIXPANEL_TOP_EVENT_PROPERTY_VALUES",
  "MIXPANEL_UPDATE_GROUP_LIST_PROPERTY",
];

describe("Mixpanel contract", () => {
  test("maps every live tool to one request or an evidence-backed gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect(coverage.full_depth).toBe(true);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(typeof operation?.request?.method, row.tool).toBe("string");
      expect(typeof operation?.request?.path, row.tool).toBe("string");
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps Basic auth, host allowlist, and bounded JSON operations", () => {
    expect(manifest.network.allowedHosts).toEqual(["mixpanel.com", "api.mixpanel.com"]);
    expect(manifest.http.baseUrl).toBe("https://mixpanel.com");
    expect(manifest.http.auth).toEqual({
      field: "serviceAccountSecret",
      in: "header",
      name: "Authorization",
      basic: { username: "{{serviceAccountUsername}}", password: "{{serviceAccountSecret}}" },
    });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.request.headers?.["Accept"], name).toBe("application/json");
      const method = operation.request.method;
      if (method === "GET") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else if (operation.request.body !== undefined) {
        expect(typeof operation.request.headers?.["Content-Type"], name).toBe("string");
      }
    }
  });

  test("sends the verbose ingestion status object for groups and identities", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return new Response(JSON.stringify({ status: 1, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const creds = { serviceAccountUsername: "svc", serviceAccountSecret: "secret", projectId: "12345" };
    const result = await actions["groups.delete"]!({
      ...creds,
      token: "project-token-123",
      group_key: "Company",
      group_id: "Mixpanel",
      fetch,
    });
    expect(new URL(seen[0].url).searchParams.get("verbose")).toBe("1");
    expect(new URL(seen[0].url).host).toBe("api.mixpanel.com");
    expect(await seen[0].text()).toBe('[{"$token":"project-token-123","$group_key":"Company","$group_id":"Mixpanel","$delete":null}]');
    expect(result.data).toEqual({ status: 1, error: null });

    seen.length = 0;
    await actions["identity.create"]!({
      ...creds,
      data: '{"event":"$identify","properties":{"$identified_id":"user-1","$anon_id":"anon-1","token":"project-token-123"}}',
      fetch,
    });
    expect(new URL(seen[0].url).searchParams.get("verbose")).toBe("1");
    expect(seen[0].headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await seen[0].text()).toBe(
      "data=%7B%22event%22%3A%22%24identify%22%2C%22properties%22%3A%7B%22%24identified_id%22%3A%22user-1%22%2C%22%24anon_id%22%3A%22anon-1%22%2C%22token%22%3A%22project-token-123%22%7D%7D",
    );
  });

  test("rejects invalid inputs and unregistered fields", async () => {
    const fetch = async () => new Response(JSON.stringify({ status: 1, error: null }), { status: 200 });
    const creds = { serviceAccountUsername: "svc", serviceAccountSecret: "secret", projectId: "12345" };
    await expect(
      actions["groups.delete"]!({ ...creds, token: "t", group_key: "", group_id: "g", fetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["projects.list"]!({ ...creds, extra: true, fetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["serviceAccounts.create"]!({ ...creds, organization_id: "90001", username: "bot", role: "root", fetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });
});
