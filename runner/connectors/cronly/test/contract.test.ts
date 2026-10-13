import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../cronly.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "CRONLY_CREATE_CERTIFICATE",
  "CRONLY_CREATE_MONITOR",
  "CRONLY_CREATE_PROJECT",
  "CRONLY_DELETE_CERTIFICATE",
  "CRONLY_DELETE_MONITOR",
  "CRONLY_DELETE_PROJECT",
  "CRONLY_GET_COMPANY",
  "CRONLY_GET_RESOURCE",
  "CRONLY_LIST_RESOURCES",
  "CRONLY_PULSE_MONITOR",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Cronly contract", () => {
  test("maps every live tool to one request or a single-route gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(coverage.composio_tools).toBe(liveTools.length);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation?.request?.method, row.tool).toBe(row.method);
      expect(operation?.request?.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
    for (const row of coverage.missing_still) {
      expect(row.why.length, row.tool).toBeGreaterThan(0);
      expect(operations[row.tool]).toBeUndefined();
    }
  });

  test("keeps JSON bounds, body-less reads, and bearer auth on cronly.app", () => {
    expect(manifest.network.allowedHosts).toEqual(["cronly.app"]);
    expect(manifest.http.baseUrl).toBe("https://cronly.app/api");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.request.baseUrl, name).toBeUndefined();
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      expect(["GET", "POST", "DELETE"].includes(method), name).toBe(true);
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends bearer auth, omits optional fields, and keeps the host fixed", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ id: 1, name: "Fixture Company", timezone: "UTC", ongoing_mails: true });
    };
    await actions["companies.get"]!({ apiKey: "secret", fetch });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).hostname).toBe("cronly.app");
    expect(new URL(seen[0].url).pathname).toBe("/api/companies");

    seen.length = 0;
    await actions["certificates.create"]!({
      apiKey: "secret",
      hostname: "cronly.app",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({
          id: 6,
          hostname: "cronly.app",
          port: 443,
          company_id: 1,
          status: "valid",
          expires_at: "2022-07-27T16:26:50.000000Z",
          last_checked_at: "2022-05-31T19:39:50.000000Z",
          created_at: "2022-05-31T19:39:50.000000Z",
          updated_at: "2022-05-31T19:39:50.000000Z",
          company: { stripe_id: "cus_fixture", zapier_key: "fixture-zapier-key" },
        });
      },
    });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"hostname":"cronly.app"}');
    expect(new URL(seen[0].url).hostname).toBe("cronly.app");

    seen.length = 0;
    const pulsed = await actions["monitors.pulse"]!({
      apiKey: "secret",
      pulseToken: "tok/en",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ status: "ok" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/monitors/pulse/tok%2Fen");
    expect(new URL(seen[0].url).hostname).toBe("cronly.app");
    expect(await seen[0].text()).toBe("");
    expect(pulsed.data).toEqual({ status: "ok" });
  });

  test("drops billing and integration secrets from company and certificate results", async () => {
    const company = await actions["companies.get"]!({
      apiKey: "secret",
      fetch: async () => json({
        id: 1,
        name: "Fixture Company",
        timezone: "UTC",
        ongoing_mails: false,
        trial_ends_at: "2022-06-30T00:00:00.000000Z",
        stripe_id: "cus_fixture",
        card_last_four: "0000",
        slack_bot_access_token: "xoxb-fixture",
        zapier_key: "fixture-zapier-key",
        billing_country: "NL",
      }),
    });
    expect(company.data).toEqual({
      id: 1,
      name: "Fixture Company",
      timezone: "UTC",
      ongoing_mails: false,
      trial_ends_at: "2022-06-30T00:00:00.000000Z",
    });

    const created = await actions["certificates.create"]!({
      apiKey: "secret",
      hostname: "cronly.app",
      port: 443,
      fetch: async () => json({
        id: 6,
        hostname: "cronly.app",
        port: 443,
        company_id: 1,
        status: "valid",
        expires_at: "2022-07-27T16:26:50.000000Z",
        last_checked_at: "2022-05-31T19:39:50.000000Z",
        created_at: "2022-05-31T19:39:50.000000Z",
        updated_at: "2022-05-31T19:39:50.000000Z",
        company: { slack_bot_access_token: "xoxb-fixture", zapier_key: "fixture-zapier-key" },
      }),
    });
    expect(created.data.company).toBeUndefined();
    expect(JSON.stringify(created.data)).not.toContain("zapier");
    expect(JSON.stringify(created.data)).not.toContain("xoxb");
  });

  test("rejects bad input, dot segments, malformed JSON, and 401", async () => {
    const fetch = async () => json({});
    await expect(actions["certificates.create"]!({
      apiKey: "secret",
      hostname: "https://cronly.app/path",
      port: 0,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["companies.get"]!({ apiKey: "secret", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["monitors.pulse"]!({
      apiKey: "secret",
      pulseToken: "..",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["companies.get"]!({
      apiKey: "secret",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["companies.get"]!({
      apiKey: "secret",
      fetch: async () => json({ error: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
