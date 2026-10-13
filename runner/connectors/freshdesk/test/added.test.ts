import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const ORIGIN_OPS_SHA256 = "c0621bb6866230e09537745a95184fe4aa8a5dbf902264a089c684e580e1207f";
const NEW_OP = "ticketFields.list";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]?.request as Record<string, unknown>;
}

describe("freshdesk origin plus public ticket fields", () => {
  test("bumps only the patch version and leaves auth and hosts unchanged", () => {
    expect(manifest.key).toBe("freshdesk");
    expect(manifest.version).toBe("0.5.1");
    expect(manifest.http.baseUrl).toBe("https://{{domainAlias}}.freshdesk.com/api/v2");
    expect(manifest.http.headers).toBeUndefined();
    expect(manifest.network.allowedHosts).toEqual(["*.freshdesk.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: { username: "{{apiKey}}", password: "X" },
    });
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual([
      "domainAlias",
      "apiKey",
    ]);
  });

  test("keeps every origin operation unchanged", () => {
    const originOps = { ...operations };
    delete originOps[NEW_OP];
    expect(Object.keys(originOps)).toHaveLength(204);
    expect(createHash("sha256").update(JSON.stringify(originOps)).digest("hex")).toBe(ORIGIN_OPS_SHA256);
    expect(Object.keys(operations)).toHaveLength(205);
    expect(requestOf("tickets.fields.list").path).toBe("/admin/ticket_fields");
    expect(requestOf("tickets.fields.list").baseUrl).toBeUndefined();
  });

  test("adds the documented public ticket field list and skips bracket routes", () => {
    expect(requestOf(NEW_OP)).toEqual({
      method: "GET",
      path: "/ticket_fields",
      success: [200],
      query: { type: "{{fieldType}}" },
      result: { fields: "{{response}}" },
    });
    expect(operations[NEW_OP]?.sideEffect).toBe("read");
    expect(operations[NEW_OP]?.outputSchema).toMatchObject({ type: "object" });
    expect(requestOf(NEW_OP).body).toBeUndefined();
    expect(requestOf(NEW_OP).headers).toBeUndefined();
    expect(requestOf(NEW_OP).baseUrl).toBeUndefined();
    const paths = Object.values(operations).map((operation) => {
      const request = operation.request as { path?: string } | undefined;
      return request?.path ?? "";
    });
    expect(paths.some((path) => path.includes("["))).toBe(false);
    expect(paths.filter((path) => path === "/ticket_fields")).toEqual(["/ticket_fields"]);
    expect(compiled.actions[NEW_OP]).toBeTypeOf("function");
  });
});

describe("freshdesk public ticket field fixture", () => {
  test("replays the JSON success fixture", async () => {
    const fixtureUrl = new URL("../fixtures/cases/ticket-fields-list-success.json", import.meta.url);
    const fixture = await Bun.file(fixtureUrl).json();
    const exchange = fixture.exchanges[0];
    const responseBody = await Bun.file(new URL(exchange.response.bodyFile, fixtureUrl)).json();
    const expected = await Bun.file(new URL(fixture.expected.resultFile, fixtureUrl)).json();
    expect(exchange.request.body).toBeNull();
    expect(exchange.request.headers["Content-Type"]).toBeUndefined();
    const requests: Request[] = [];
    const result = await compiled.actions[fixture.operation]! ({
      ...fixture.credentials,
      ...fixture.input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(url, init));
        return new Response(JSON.stringify(responseBody), {
          status: exchange.response.status,
          headers: exchange.response.headers,
        });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe(exchange.request.url);
    expect(requests[0]!.headers.get("authorization")).toBe(exchange.request.headers.Authorization);
    expect(requests[0]!.headers.get("content-type")).toBeNull();
    expect(await requests[0]!.clone().text()).toBe("");
    expect(result).toEqual(expected);
  });
});
