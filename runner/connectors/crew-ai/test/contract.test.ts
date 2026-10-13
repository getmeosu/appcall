import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../crew-ai.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest);
const liveTools = [
  "CREW_AI_GET_DEPLOYMENT_LOGS",
  "CREW_AI_GET_DEPLOYMENT_STATUS",
  "CREW_AI_GET_EXECUTION_STATUS",
  "CREW_AI_GET_REQUIRED_INPUTS",
  "CREW_AI_LIST_CREW_DEPLOYMENTS",
  "CREW_AI_REDEPLOY_CREW",
  "CREW_AI_RESUME_CREW_EXECUTION",
  "CREW_AI_START_CREW_EXECUTION",
];

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("CrewAI contract", () => {
  test("maps every live tool to one JSON request", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row: { tool: string }) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      if ("baseUrl" in row && row.baseUrl) {
        expect(operation.request.baseUrl, row.tool).toBe(row.baseUrl);
      } else {
        expect(operation.request.baseUrl, row.tool).toBeUndefined();
      }
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps bearer auth, fixed hosts, and JSON bounds", () => {
    expect(manifest.network.allowedHosts).toEqual(["app.crewai.com", "*.crewai.com"]);
    expect(manifest.http.baseUrl).toBe("https://{{crewName}}.crewai.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    const crewName = manifest.auth.setup.fields.find((field) => field.key === "crewName");
    expect(crewName?.required).toBe(true);
    expect(crewName?.secret).toBe(false);
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      const method = operation.request.method;
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else if (operation.request.body === undefined) {
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
      }
    }
  });

  test("sends the crew host bearer and does not accept a free-form URL", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ inputs: ["topic"] });
    };
    const result = await actions["inputs.get"]!({ apiKey: "secret", crewName: "research-assistant-crew", fetch });
    expect(seen[0].url).toBe("https://research-assistant-crew.crewai.com/inputs");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(result.data).toEqual({ inputs: ["topic"] });
    await expect(actions["inputs.get"]!({
      apiKey: "secret",
      crewName: "https://evil.example",
      fetch: async () => {
        throw new Error("fetch should not run");
      },
    })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
    await expect(actions["inputs.get"]!({
      apiKey: "secret",
      crewName: "evil.com/path",
      fetch: async () => {
        throw new Error("fetch should not run");
      },
    })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });

  test("redeploys on app.crewai.com without a body and rejects a blank uuid", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ uuid: "11111111-1111-4111-8111-111111111111", status: "Deploy Enqueued" });
    };
    await actions["deployments.redeploy"]!({
      apiKey: "pat",
      crewName: "research-assistant-crew",
      crewUuid: "11111111-1111-4111-8111-111111111111",
      fetch,
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://app.crewai.com/crewai_plus/api/v1/crews/11111111-1111-4111-8111-111111111111/deploy");
    expect(seen[0].headers.get("authorization")).toBe("Bearer pat");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    await expect(actions["deployments.status"]!({
      apiKey: "pat",
      crewName: "research-assistant-crew",
      crewUuid: "",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("omits optional kickoff fields and surfaces 401 and 429", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ kickoff_id: "11111111-2222-4333-8444-555555555555" });
    };
    await actions["executions.start"]!({
      apiKey: "secret",
      crewName: "research-assistant-crew",
      inputs: { topic: "agents" },
      fetch,
    });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"inputs":{"topic":"agents"}}');
    await expect(actions["executions.status"]!({
      apiKey: "secret",
      crewName: "research-assistant-crew",
      kickoffId: "11111111-2222-4333-8444-555555555555",
      fetch: async () => json({ error: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["inputs.get"]!({
      apiKey: "secret",
      crewName: "research-assistant-crew",
      fetch: async () => json({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
