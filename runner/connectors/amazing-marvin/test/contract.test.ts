import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const operations = manifest.operations as Record<string, Record<string, any>>;
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const creds = {
  apiToken: "fixture-api-token",
  fullAccessToken: "fixture-full-access-token",
};

describe("Amazing Marvin contract", () => {
  test("uses the documented host and token headers, not Bearer", () => {
    expect(manifest.network.allowedHosts).toEqual(["serv.amazingmarvin.com"]);
    expect(manifest.http.baseUrl).toBe("https://serv.amazingmarvin.com/api");
    expect(manifest.http.auth).toEqual({ field: "apiToken" });
    expect(JSON.stringify(manifest)).not.toContain("Bearer");
    expect(Object.keys(operations).sort()).toEqual([
      "documents.update",
      "projects.create",
      "reminders.list",
      "tasks.complete",
      "tasks.create",
      "time-tracking.current",
      "time-tracking.set",
    ]);
  });

  test("GET is body-less and POST sets JSON content type only with a body", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, any>;
      expect(request.method === "GET" || request.method === "POST", key).toBe(true);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.outputSchema.type).toBe("object");
      expect(operation.responseFormat).toBe("json");
      if (request.method === "GET") {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      } else {
        expect(request.headers["Content-Type"], key).toBe("application/json");
        expect(request.body, key).toBeDefined();
      }
    }
  });

  test("complete task posts markDone with the limited token and requires confirmation", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const result = await actions["tasks.complete"]!({
      ...creds,
      task_id: "task_1",
      confirm_completion: true,
      time_zone_offset_minutes: -480,
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({ _id: "task_1", done: true });
      },
    });
    expect(seen[0].url).toBe("https://serv.amazingmarvin.com/api/markDone");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.body).toBe('{"itemId":"task_1","timeZoneOffset":-480}');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers["X-API-Token"]).toBe("fixture-api-token");
    expect(headers["X-Full-Access-Token"]).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
    expect(result.data).toEqual({ _id: "task_1", done: true });
    await expect(actions["tasks.complete"]!({
      ...creds,
      task_id: "task_1",
      confirm_completion: false,
      time_zone_offset_minutes: 0,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("create task can disable title autocompletion and omits unset fields", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await actions["tasks.create"]!({
      ...creds,
      title: "Write notes",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({ _id: "task_new", title: "Write notes" });
      },
    });
    expect(seen[0].url).toBe("https://serv.amazingmarvin.com/api/addTask");
    expect(seen[0].init.body).toBe('{"title":"Write notes"}');
    expect((seen[0].init.headers as Record<string, string>)["X-Auto-Complete"]).toBeUndefined();
    seen.length = 0;
    await actions["tasks.create"]!({
      ...creds,
      title: "Literal #123",
      auto_complete_title: "false",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({ _id: "task_new", title: "Literal #123" });
      },
    });
    expect((seen[0].init.headers as Record<string, string>)["X-Auto-Complete"]).toBe("false");
  });

  test("reminders list uses the full-access token and wraps the JSON array", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const result = await actions["reminders.list"]!({
      ...creds,
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response([{ reminderId: "rem_1" }]);
      },
    });
    expect(seen[0].url).toBe("https://serv.amazingmarvin.com/api/reminders");
    expect(seen[0].init.method).toBe("GET");
    expect(seen[0].init.body).toBeUndefined();
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers["X-Full-Access-Token"]).toBe("fixture-full-access-token");
    expect(headers["X-API-Token"]).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(result.data).toEqual([{ reminderId: "rem_1" }]);
  });

  test("document update posts setters with the full-access token", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await actions["documents.update"]!({
      ...creds,
      document_id: "task_1",
      setters: [{ key: "title", val: "Renamed" }],
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({ _id: "task_1", title: "Renamed" });
      },
    });
    expect(seen[0].url).toBe("https://serv.amazingmarvin.com/api/doc/update");
    expect(seen[0].init.body).toBe('{"itemId":"task_1","setters":[{"key":"title","val":"Renamed"}]}');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers["X-Full-Access-Token"]).toBe("fixture-full-access-token");
    expect(headers["X-API-Token"]).toBeUndefined();
  });

  test("rejects extra input, malformed JSON, 401, and 429", async () => {
    await expect(actions["time-tracking.current"]!({
      ...creds,
      extra: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["time-tracking.current"]!({
      ...creds,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["time-tracking.current"]!({
      ...creds,
      fetch: async () => response({ error: "unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["time-tracking.set"]!({
      ...creds,
      task_id: "task_1",
      action: "STOP",
      fetch: async () => response({ error: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
