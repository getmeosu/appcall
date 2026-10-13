import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: { apiKey: string };
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; body: string | null };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
};

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(new URL(file, casesDir), "utf8")) as FixtureCase);
}

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const okBody = { success: true, message: "OK" };

describe("carbone actions", () => {
  test("replays one success fixture for every action", async () => {
    const cases = loadCases();
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key);
    const positive = cases.filter((item) => item.expected.kind === "success");
    expect(positive.map((item) => item.operation).sort()).toEqual([...actionKeys].sort());

    for (const item of positive) {
      const exchange = item.exchanges[0]!;
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, new URL(`${item.id}.json`, casesDir)), "utf8");
      const expected = JSON.parse(readFileSync(new URL(item.expected.resultFile, new URL(`${item.id}.json`, casesDir)), "utf8"));
      const seen: { url: string; method: string; headers: Headers; body: string }[] = [];
      const result = await actions[item.operation]!({
        ...item.input,
        apiKey: item.credentials.apiKey,
        fetch: async (url: string | URL, init?: RequestInit) => {
          const request = new Request(url, init);
          seen.push({ url: request.url, method: request.method, headers: request.headers, body: await request.text() });
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen, item.id).toHaveLength(1);
      expect(seen[0]!.method, item.id).toBe(exchange.request.method);
      expect(seen[0]!.url, item.id).toBe(exchange.request.url);
      expect(seen[0]!.headers.get("accept"), item.id).toBe("application/json");
      expect(seen[0]!.headers.get("authorization"), item.id).toBe(exchange.request.headers.Authorization);
      expect(seen[0]!.headers.get("carbone-version"), item.id).toBe("5");
      const sentBody = seen[0]!.body === "" ? null : seen[0]!.body;
      expect(sentBody, item.id).toBe(exchange.request.body);
      if (exchange.request.body === null) expect(seen[0]!.headers.get("content-type"), item.id).toBeNull();
      else expect(seen[0]!.headers.get("content-type"), item.id).toBe("application/json");
      expect(result, item.id).toEqual(expected);
    }
  });

  test("pins v5, omits unset template filters, and encodes the template id", async () => {
    const listSeen: Request[] = [];
    await actions["templates.list"]!({
      apiKey: "tok",
      fetch: async (url: string | URL, init?: RequestInit) => {
        listSeen.push(new Request(url, init));
        return jsonResponse({ success: true, data: [], hasMore: false });
      },
    });
    const listUrl = new URL(listSeen[0]!.url);
    expect(listUrl.pathname).toBe("/templates");
    expect(listUrl.search).toBe("");
    expect(listSeen[0]!.method).toBe("GET");
    expect(listSeen[0]!.body).toBeNull();
    expect(listSeen[0]!.headers.get("content-type")).toBeNull();
    expect(listSeen[0]!.headers.get("carbone-version")).toBe("5");

    const versionSeen: Request[] = [];
    await actions["templates.tags.list"]!({
      apiKey: "tok",
      carboneVersion: 4,
      fetch: async (url: string | URL, init?: RequestInit) => {
        versionSeen.push(new Request(url, init));
        return jsonResponse({ success: true, data: [] });
      },
    });
    expect(new URL(versionSeen[0]!.url).pathname).toBe("/templates/tags");
    expect(new URL(versionSeen[0]!.url).search).toBe("");
    expect(versionSeen[0]!.headers.get("carbone-version")).toBe("4");

    const deleteSeen: Request[] = [];
    await actions["templates.delete"]!({
      apiKey: "tok",
      templateId: "ab/cd",
      fetch: async (url: string | URL, init?: RequestInit) => {
        deleteSeen.push(new Request(url, init));
        return jsonResponse({ success: true, message: "Template deleted" });
      },
    });
    expect(new URL(deleteSeen[0]!.url).pathname).toBe("/template/ab%2Fcd");
    expect(deleteSeen[0]!.method).toBe("DELETE");
    expect(deleteSeen[0]!.headers.get("content-type")).toBeNull();
    expect(deleteSeen).toHaveLength(1);
    expect(listSeen).toHaveLength(1);
    expect(versionSeen).toHaveLength(1);
  });

  test("sends one JSON render body and does not request the file", async () => {
    const seen: Request[] = [];
    const result = await actions["reports.generate"]!({
      apiKey: "tok",
      templateId: "424242424242",
      data: [{ name: "Ada" }],
      fetch: async (url: string | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return jsonResponse({ success: true, data: { renderId: "fixture-render-id" } });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("https://api.carbone.io/render/424242424242");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(seen[0]!.headers.get("carbone-webhook-url")).toBeNull();
    expect(await seen[0]!.text()).toBe("{\"data\":[{\"name\":\"Ada\"}]}");
    expect(result).toMatchObject({
      connector: "carbone",
      action: "reports.generate",
      source: "provider",
      data: { success: true, data: { renderId: "fixture-render-id" } },
    });
  });

  test("rejects invalid input, a non-object body, 401, and 429", async () => {
    await expect(actions["templates.upload"]!({
      apiKey: "tok",
      template: "",
      fetch: async () => jsonResponse(okBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["templates.update"]!({
      apiKey: "tok",
      templateId: "424242424242",
      fetch: async () => jsonResponse(okBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["reports.generate"]!({
      apiKey: "tok",
      templateId: "424242424242",
      data: "{\"name\":\"Ada\"}",
      fetch: async () => jsonResponse(okBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["reports.render-direct"]!({
      apiKey: "tok",
      template: "UEsDBA==",
      data: { name: "Ada" },
      download: true,
      fetch: async () => jsonResponse(okBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["status.get"]!({
      apiKey: "tok",
      baseUrl: "https://evil.example",
      fetch: async () => jsonResponse(okBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["status.get"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["status.get"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ message: "OK" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["templates.list"]!({
      apiKey: "tok",
      fetch: async () => new Response("OK", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["status.get"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ success: false, error: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["reports.generate"]!({
      apiKey: "tok",
      templateId: "424242424242",
      data: { name: "Ada" },
      fetch: async () => jsonResponse({ success: false, error: "Slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
