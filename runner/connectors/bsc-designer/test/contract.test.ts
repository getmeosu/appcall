import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../bsc-designer.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "BSC_DESIGNER_BALANCE_SCORECARD_WEIGHTS",
  "BSC_DESIGNER_DOWNLOAD_EXCEL_REPORT",
  "BSC_DESIGNER_GET_DOCUMENT",
  "BSC_DESIGNER_GET_GROUPED_INDICATOR_VALUES",
  "BSC_DESIGNER_GET_INDICATOR_VALUE",
  "BSC_DESIGNER_GET_SCORECARD_ITEM",
  "BSC_DESIGNER_LIST_DOCUMENTS",
  "BSC_DESIGNER_LIST_SCORECARD_ITEMS",
  "BSC_DESIGNER_SET_INDICATOR_VALUES",
  "BSC_DESIGNER_UPDATE_INDICATOR",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchSeen = (seen: Request[], body: unknown) =>
  async (input: string | URL, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return json(body);
  };

describe("BSC Designer contract", () => {
  test("maps every live tool to one JSON request or a non-HTTP gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect(coverage.missing_http).toEqual([]);
    expect(missing).toEqual(["BSC_DESIGNER_DOWNLOAD_EXCEL_REPORT"]);
    expect(coverage.missing_still[0].why).toBe(
      "GET /rest/api/report/{id}/excel returns Excel bytes (OpenAPI string format byte), not a JSON object or array.",
    );
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(operation.request.baseUrl, row.tool).toBeUndefined();
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps token auth, the official host, and JSON bounds", () => {
    expect(manifest.network.allowedHosts).toEqual(["www.webbsc.com"]);
    expect(manifest.http.baseUrl).toBe("https://www.webbsc.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "token",
      value: "{{apiKey}}",
    });
    for (const [name, operation] of Object.entries(operations)) {
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
      const method = operation.request.method;
      if (method === "GET" || method === "DELETE" || operation.request.body === undefined) {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends the token header, encodes ids, and omits unspecified fields", async () => {
    const seen: Request[] = [];
    await actions["documents.list"]!({ apiKey: "secret", fetch: fetchSeen(seen, { documents: [], sharedToUser: [] }) });
    expect(seen[0].headers.get("token")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(new URL(seen[0].url).pathname).toBe("/rest/api/documents/list");
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    await actions["scorecard-items.get"]!({
      apiKey: "secret",
      documentIdOrAlias: "team/score",
      itemId: "{KPI-1}",
      fetch: fetchSeen(seen, { guid: "{KPI-1}", name: "NPS" }),
    });
    expect(new URL(seen[0].url).pathname).toBe("/rest/api/document/team%2Fscore/kpi/%7BKPI-1%7D");

    seen.length = 0;
    await actions["indicators.update"]!({
      apiKey: "secret",
      documentIdOrAlias: "strategy",
      indicatorId: "{KPI-1}",
      name: "NPS",
      fetch: fetchSeen(seen, { guid: "{KPI-1}", name: "NPS" }),
    });
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"name":"NPS"}');

    seen.length = 0;
    await actions["indicators.set-values"]!({
      apiKey: "secret",
      documentIdOrAlias: "strategy",
      date: "2024-03-01",
      values: [{ item: { guid: "{KPI-1}" }, target: 20 }],
      fetch: fetchSeen(seen, { values: [] }),
    });
    expect(seen[0].method).toBe("POST");
    expect(await seen[0].text()).toBe('{"values":[{"item":{"guid":"{KPI-1}"},"target":20}]}');

    seen.length = 0;
    await actions["scorecards.balance-weights"]!({
      apiKey: "secret",
      documentIdOrAlias: "strategy",
      fetch: fetchSeen(seen, []),
    });
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).pathname).toBe("/rest/api/document/strategy/kpi/weight-balance");
  });

  test("rejects bad input, dot segments, malformed JSON, and 401", async () => {
    const fetch = async () => json({});
    await expect(actions["documents.list"]!({ apiKey: "secret", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["indicators.grouped-values"]!({
      apiKey: "secret",
      documentIdOrAlias: "strategy",
      indicatorId: "{KPI-1}",
      period: "day",
      startDate: "2024-01-01",
      endDate: "2024-03-31",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["indicators.set-values"]!({
      apiKey: "secret",
      documentIdOrAlias: "strategy",
      date: "2024-03-01",
      values: [{ item: { guid: "{KPI-1}" } }],
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.get"]!({
      apiKey: "secret",
      documentIdOrAlias: "..",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.list"]!({
      apiKey: "secret",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["documents.list"]!({
      apiKey: "secret",
      fetch: async () => json({ message: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("wraps a JSON array under data", async () => {
    const result = await actions["scorecards.balance-weights"]!({
      apiKey: "secret",
      documentIdOrAlias: "strategy",
      fetch: async () => json([{ indicatorGuid: "{KPI-1}", indicatorName: "NPS", oldWeight: 50, newWeight: 40 }]),
    });
    expect(result.data).toEqual([{ indicatorGuid: "{KPI-1}", indicatorName: "NPS", oldWeight: 50, newWeight: 40 }]);
  });
});
