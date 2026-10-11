import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import statusesResponse from "../fixtures/responses/statuses.json";
import { encodeBaselinkerForm } from "../src/http";

describe("baselinker http encoding", () => {
  test("encodes method plus nested JSON parameters as form fields", () => {
    expect(encodeBaselinkerForm("getOrders", { date_from: 1407341754, get_unconfirmed_orders: false })).toBe(
      "method=getOrders&parameters=%7B%22date_from%22%3A1407341754%2C%22get_unconfirmed_orders%22%3Afalse%7D",
    );
  });

  test("compiled origin healthcheck still posts empty parameters JSON", async () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    const calls: Request[] = [];
    const result = await compiled.actions.healthcheck({
      apiKey: "fixturekey",
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        calls.push(new Request(url, init));
        return new Response(JSON.stringify(statusesResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const params = new URLSearchParams(await calls[0].text());
    expect(params.get("method")).toBe("getOrderStatusList");
    expect(params.get("parameters")).toBe("{}");
    expect(result).toMatchObject({
      connector: "baselinker",
      action: "healthcheck",
      source: "provider",
      data: statusesResponse,
    });
  });
});
