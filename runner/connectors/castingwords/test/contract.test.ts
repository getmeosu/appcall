import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../castingwords.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const liveTools = [
  "CASTINGWORDS_CANCEL_AUDIOFILE",
  "CASTINGWORDS_GET_PREPAY_BALANCE",
  "CASTINGWORDS_GET_TRANSCRIPT",
  "CASTINGWORDS_GET_WEBHOOK",
  "CASTINGWORDS_ORDER_TRANSCRIPT",
  "CASTINGWORDS_ORDER_UPGRADES",
  "CASTINGWORDS_REGISTER_WEBHOOK",
  "CASTINGWORDS_SKU_LIST",
  "CASTINGWORDS_TEST_WEBHOOK",
];

describe("CastingWords read contract", () => {
  test("maps every live tool to one JSON route or a non-JSON gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    for (const row of coverage.mapped) {
      const operation = manifest.operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(operation.responseFormat, row.tool).toBe("json");
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
    expect(manifest.operations["transcription.status"].request.path).toBe("/audiofile/{{audiofileId}}");
  });

  test("uses query api_key on castingwords.com and stays body-less", () => {
    expect(manifest.network.allowedHosts).toEqual(["castingwords.com"]);
    expect(manifest.http.baseUrl).toBe("https://castingwords.com/store/API4");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "query",
      name: "api_key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    for (const [name, operation] of Object.entries(manifest.operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.request.body, name).toBeUndefined();
      expect(operation.request.headers, name).toBeUndefined();
      expect(operation.request.path.startsWith("/"), name).toBe(true);
      expect(operation.request.path.includes("http"), name).toBe(false);
    }
  });

  test("sends api_key, does not call a caller URL, and encodes the audiofile id", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ audiofiles: [101], order: "0a0", message: "Order '0a0' Created" });
    };
    await actions["orders.create"]!({
      apiKey: "secret",
      url: "https://cdn.example/audio.mp3",
      sku: ["TRANS14"],
      fetch,
    });
    const orderUrl = new URL(seen[0].url);
    expect(orderUrl.hostname).toBe("castingwords.com");
    expect(orderUrl.pathname).toBe("/store/API4/order_url");
    expect(orderUrl.searchParams.get("api_key")).toBe("secret");
    expect(orderUrl.searchParams.get("url")).toBe("https://cdn.example/audio.mp3");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen).toHaveLength(1);

    seen.length = 0;
    await actions["audiofiles.refund"]!({
      apiKey: "secret",
      audiofileId: 101,
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ message: "Refund approved" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/store/API4/audiofile/101/refund");
    expect(seen[0].headers.get("accept")).toBe("application/json");
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(actions["orders.create"]!({ apiKey: "secret", sku: ["TRANS14"], fetch: async () => response({}) })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}, 429, { "Retry-After": "4" }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
