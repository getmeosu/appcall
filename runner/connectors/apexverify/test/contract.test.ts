import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const uuid = "11111111-1111-4111-8111-111111111111";

describe("ApexVerify contract", () => {
  test("uses the documented host and X-API-Key header", async () => {
    const seen: Request[] = [];
    await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ email_credit: 1, phone_credit: 1 });
      },
    });
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).hostname).toBe("api.apexverify.com");
    expect(new URL(seen[0].url).pathname).toBe("/v1/account/credits");
    expect(manifest.network.allowedHosts).toEqual(["api.apexverify.com"]);
  });

  test("encodes batch ids, date filters, and does not follow redirects", async () => {
    const seen: Request[] = [];
    const result = await actions["batches.list"]!({
      apiKey: "secret",
      fromDate: "2024-01-15T09:30:00Z",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ batch_uuid: uuid, name: "Leads", status: "parsing_content" }]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.searchParams.get("from_date")).toBe("2024-01-15T09:30:00Z");
    expect(url.searchParams.has("to_date")).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(seen).toHaveLength(1);

    const detail: Request[] = [];
    await actions["batches.get"]!({
      apiKey: "secret",
      batchUuid: "a/b",
      fetch: async (input, init) => {
        detail.push(new Request(input, init));
        return response({ status: "parsing_content", batch_uuid: "a/b", name: "Leads" });
      },
    });
    expect(new URL(detail[0].url).pathname).toBe("/v1/batch/a%2Fb/details");
  });

  test("keeps confirmation flags and xlsx off the wire", async () => {
    const seen: Request[] = [];
    await actions["units.verify"]!({
      apiKey: "secret",
      type: "email",
      targetCountry: "US",
      unit: "ada@example.com",
      confirmCreditUsage: true,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "ok", verification_result: { email: "ada@example.com", valid: true } });
      },
    });
    expect(await seen[0].text()).toBe('{"type":"email","target_country":"US","unit":"ada@example.com"}');
    expect(seen[0].headers.get("content-type")).toBe("application/json");

    const launch: Request[] = [];
    await actions["batches.launch"]!({
      apiKey: "secret",
      batchUuid: uuid,
      confirmCreditSpend: true,
      fetch: async (input, init) => {
        launch.push(new Request(input, init));
        return response({ status: "ok" });
      },
    });
    expect(launch[0].method).toBe("POST");
    expect(await launch[0].text()).toBe("");
    expect(launch[0].headers.get("content-type")).toBeNull();

    await expect(actions["batches.export"]!({
      apiKey: "secret",
      batchUuid: uuid,
      format: "xlsx",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["batches.delete"]!({
      apiKey: "secret",
      batchUuid: uuid,
      confirmDeletion: false,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("rejects bad input and classifies 401 and 429", async () => {
    await expect(actions["batches.get"]!({
      apiKey: "secret",
      batchUuid: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["account.credits.get"]!({
      apiKey: "secret",
      extra: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["account.credits.get"]!({
      apiKey: "secret",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["account.credits.get"]!({
      apiKey: "secret",
      fetch: async () => response({ message: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["account.credits.get"]!({
      apiKey: "secret",
      fetch: async () => response({ message: "Too Many Requests" }, 429, { "Retry-After": "44" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 44 });
  });

  test("bounds every operation and maps the live JSON tools", () => {
    const mapped: Record<string, { method: string; path: string }> = {
      "account.credits.get": { method: "GET", path: "/v1/account/credits" },
      "batches.list": { method: "GET", path: "/v1/batch" },
      "batches.get": { method: "GET", path: "/v1/batch/{{batchUuid}}/details" },
      "batches.prepare": { method: "PATCH", path: "/v1/batch/{{batchUuid}}" },
      "batches.launch": { method: "POST", path: "/v1/batch/{{batchUuid}}" },
      "batches.delete": { method: "DELETE", path: "/v1/batch/{{batchUuid}}" },
      "batches.export": { method: "GET", path: "/v1/batch/{{batchUuid}}/export" },
      "units.verify": { method: "POST", path: "/v1/unit" },
    };
    expect(Object.keys(manifest.operations).sort()).toEqual(
      ["account.credits.get", "batches.delete", "batches.export", "batches.get", "batches.launch", "batches.list", "batches.prepare", "healthcheck", "units.verify"],
    );
    for (const [key, operation] of Object.entries(manifest.operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.title, key).toBeTypeOf("string");
      expect(operation.description, key).toBeTypeOf("string");
      expect(operation.inputSchema.type, key).toBe("object");
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.request.method, key).toMatch(/^(GET|POST|PATCH|DELETE)$/);
      expect(operation.request.path, key).toStartWith("/");
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body, key).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], key).toBeUndefined();
      }
      if (key !== "units.verify") {
        expect(operation.request.body, key).toBeUndefined();
      }
    }
    for (const [key, request] of Object.entries(mapped)) {
      expect(manifest.operations[key].request.method).toBe(request.method);
      expect(manifest.operations[key].request.path).toBe(request.path);
    }
    expect(manifest.operations["batches.export"].inputSchema.properties.format.enum).toEqual(["json"]);
    expect(manifest.operations.healthcheck.sideEffect).toBe("read");
  });
});
