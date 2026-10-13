import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const auth = `Basic ${Buffer.from("owner@example.com:fixture-rest-key", "utf8").toString("base64")}`;
const creds = { domain: "acme", email: "owner@example.com", apiKey: "fixture-rest-key" };
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

type Op = {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; success?: number[] };
};

const operations = manifest.operations as Record<string, Op>;

describe("agile-crm contract", () => {
  test("compiles tenant basic auth on the agilecrm host only", () => {
    expect(manifest.key).toBe("agile-crm");
    expect(manifest.network.allowedHosts).toEqual(["*.agilecrm.com"]);
    expect(manifest.http.baseUrl).toBe("https://{{domain}}.agilecrm.com/dev");
    expect(manifest.http.auth.basic).toEqual({ username: "{{email}}", password: "{{apiKey}}" });
    expect(manifest.http.auth.value).toBeUndefined();
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(operations).sort()).toEqual([
      "contacts.create",
      "contacts.get",
      "contacts.list",
      "contacts.update",
      "deals.create",
      "deals.get",
      "deals.list",
      "deals.update",
    ]);
  });

  test("every action is one JSON route with a bounded object schema", () => {
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes ?? 0, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.path?.startsWith("/"), name).toBe(true);
      expect(request?.success, name).toEqual([200]);
      expect(request?.path?.includes(" "), name).toBe(false);
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"], name).toBeUndefined();
        expect(operation.sideEffect, name).toBe("read");
      } else {
        expect(request?.body, name).toBeDefined();
        expect(request?.headers?.["Content-Type"], name).toBe("application/json");
        expect(operation.sideEffect, name).toBe("write");
      }
    }
  });

  test("sends basic auth and omits empty create fields", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["contacts.create"]!({
      ...creds,
      resource_type: "COMPANY",
      properties: [{ type: "SYSTEM", name: "name", value: "Spicejet" }],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ id: 1, type: "COMPANY" });
      },
    });
    expect(seen[0].url).toBe("https://acme.agilecrm.com/dev/api/contacts");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("authorization")).toBe(auth);
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"type":"COMPANY","properties":[{"type":"SYSTEM","name":"name","value":"Spicejet"}]}');
  });

  test("lists contacts without a cursor and does not follow another host", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["contacts.list"]!({
      ...creds,
      page_size: 2,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ id: 7, type: "PERSON" }]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/dev/api/contacts");
    expect(url.searchParams.get("page_size")).toBe("2");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(result.data).toEqual([{ id: 7, type: "PERSON" }]);
    expect(seen).toHaveLength(1);
  });

  test("rejects bad input, a colon username, 204, malformed JSON, 401, and 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return response({});
    };
    await expect(actions["deals.create"]!({ ...creds, name: "x", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.get"]!({ ...creds, resource_id: 0, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.get"]!({ ...creds, email: "a:b@example.com", resource_id: 9, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
    await expect(actions["contacts.get"]!({ ...creds, resource_id: 9, fetch: async () => new Response(null, { status: 204 }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["deals.get"]!({ ...creds, deal_id: 9, fetch: async () => response("[]", 200) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["deals.get"]!({ ...creds, deal_id: 9, fetch: async () => new Response("not-json", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["contacts.get"]!({ ...creds, resource_id: 9, fetch: async () => response({ message: "fixture-rest-key" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "[REDACTED]" });
    await expect(actions["deals.list"]!({ ...creds, fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
