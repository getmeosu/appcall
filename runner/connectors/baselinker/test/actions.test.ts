import { describe, expect, test } from "bun:test";
import catalog from "../src/catalog.json";
import { executeBaselinkerAction } from "../src/actions";
import { encodeBaselinkerForm } from "../src/http";
import ordersResponse from "../fixtures/responses/orders.json";
import statusesResponse from "../fixtures/responses/statuses.json";
import unauthorized from "../fixtures/responses/unauthorized.json";

type CatalogEntry = {
  tool: string;
  operation: string;
  method: string;
  required: string[];
  properties: Record<string, { type?: string }>;
};

const tools = catalog as CatalogEntry[];
const TOKEN = "fixturekey";

function dummyValue(name: string, type: string | undefined): unknown {
  if (type === "integer" || type === "number") return 1;
  if (type === "boolean") return true;
  if (type === "array") return [1];
  if (type === "object") return { "1": 1 };
  return "sample";
}

function requiredInput(entry: CatalogEntry): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const name of entry.required) {
    input[name] = dummyValue(name, entry.properties[name]?.type);
  }
  return input;
}

function stubFetch(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (url: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(url, requestInit));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  }) as typeof fetch;
  return { calls, impl };
}

describe("baselinker handwritten actions", () => {
  test("echoes validation without a credential", () => {
    const result = executeBaselinkerAction("orders.list", { date_from: 1407341754 });
    expect(result).toMatchObject({
      connector: "baselinker",
      action: "orders.list",
      source: "connector",
      validated: { date_from: 1407341754 },
    });
  });

  test("rejects extra fields on healthcheck", async () => {
    await expect(
      executeBaselinkerAction("healthcheck", { apiKey: TOKEN, unknownField: "nope" }),
    ).rejects.toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
  });

  test("posts form-encoded JSON parameters for orders.list filters", async () => {
    const { calls, impl } = stubFetch(ordersResponse);
    const result = await executeBaselinkerAction("orders.list", {
      apiKey: TOKEN,
      date_from: 1407341754,
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.baselinker.com/connector.php");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("x-bltoken")).toBe(TOKEN);
    expect(calls[0].headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(await calls[0].text());
    expect(params.get("method")).toBe("getOrders");
    expect(JSON.parse(params.get("parameters") ?? "")).toEqual({ date_from: 1407341754 });
    expect(result).toMatchObject({
      connector: "baselinker",
      action: "orders.list",
      source: "provider",
      data: ordersResponse,
    });
  });

  test("keeps empty parameters JSON for origin list reads", async () => {
    const { calls, impl } = stubFetch(statusesResponse);
    await executeBaselinkerAction("statuses.list", { apiKey: TOKEN, fetch: impl });
    const params = new URLSearchParams(await calls[0].text());
    expect(params.get("method")).toBe("getOrderStatusList");
    expect(params.get("parameters")).toBe("{}");
    expect(params.toString()).toBe(encodeBaselinkerForm("getOrderStatusList", {}));
  });

  test("maps BaseLinker ERROR envelopes to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = stubFetch(unauthorized);
    await expect(
      executeBaselinkerAction("healthcheck", { apiKey: "bad", fetch: impl }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Incorrect API token" });
  });

  test("maps provider limit errors to CONNECTOR_RATE_LIMITED", async () => {
    const { impl } = stubFetch(
      { status: "ERROR", error_code: "ERROR_LIMIT", error_message: "Request limit exceeded" },
      { status: 200 },
    );
    await expect(
      executeBaselinkerAction("orders.list", { apiKey: TOKEN, fetch: impl }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("serializes nested objects and arrays for write tools", async () => {
    const product = tools.find((tool) => tool.tool === "BASELINKER_ADD_INVENTORY_PRODUCT");
    expect(product).toBeDefined();
    const { calls, impl } = stubFetch({ status: "SUCCESS", product_id: "123" });
    await executeBaselinkerAction(product!.operation, {
      apiKey: TOKEN,
      inventory_id: "306",
      sku: "LGT-MX-BLK",
      prices: { "105": 129.99 },
      stock: { bl_205: 4 },
      text_fields: { name: "Wireless Mouse" },
      fetch: impl,
    });
    const params = new URLSearchParams(await calls[0].text());
    expect(params.get("method")).toBe("addInventoryProduct");
    expect(JSON.parse(params.get("parameters") ?? "")).toEqual({
      inventory_id: "306",
      sku: "LGT-MX-BLK",
      prices: { "105": 129.99 },
      stock: { bl_205: 4 },
      text_fields: { name: "Wireless Mouse" },
    });
  });

  test("issues a real connector.php POST for every Composio tool", async () => {
    for (const tool of tools) {
      const { calls, impl } = stubFetch({ status: "SUCCESS" });
      const result = await executeBaselinkerAction(tool.operation, {
        apiKey: TOKEN,
        fetch: impl,
        ...requiredInput(tool),
      });
      expect(calls).toHaveLength(1);
      const params = new URLSearchParams(await calls[0].text());
      expect(params.get("method")).toBe(tool.method);
      expect(JSON.parse(params.get("parameters") ?? "")).toEqual(requiredInput(tool));
      expect(result).toMatchObject({
        connector: "baselinker",
        action: tool.operation,
        source: "provider",
        data: { status: "SUCCESS" },
      });
    }
  });
});
