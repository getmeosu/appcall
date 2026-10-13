import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coreFixtures from "../fixtures/core_success.json";
import expandedFixtures from "../fixtures/expanded_api_methods.json";
import { slackExpandedActionHandlers } from "../src/expanded_actions";
import { slackCoreActionHandlers, sendMessage } from "../src/core_actions";

type CoreFixture = {
  input: Record<string, unknown>;
  method: string;
  url: string;
  body: string | null;
  response: Record<string, unknown>;
};

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  inputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; bodyEncoding?: string; headers?: Record<string, string> };
}>;
const fixtures = coreFixtures as Record<string, CoreFixture>;
const depthCaseDir = join(import.meta.dir, "../fixtures/cases");
const depthFixtureOperations = new Set(
  readdirSync(depthCaseDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => (JSON.parse(readFileSync(join(depthCaseDir, name), "utf8")) as { operation: string }).operation),
);
const recipe = JSON.parse(readFileSync(join(import.meta.dir, "../../recipes/slack/recipe.json"), "utf8")) as {
  manifest: { operations: Record<string, { request?: unknown }> };
};

describe("slack core Web API depth", () => {
  test("gives every non-webhook operation a request or an expanded handler", () => {
    const uncovered: string[] = [];
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
        continue;
      }
      expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      const hasRequest = typeof request?.method === "string" && typeof request.path === "string" && request.path.startsWith("/");
      const hasHandler = typeof slackExpandedActionHandlers[key] === "function" || typeof slackCoreActionHandlers[key] === "function";
      if (!hasRequest && !hasHandler) uncovered.push(key);
      if (operation.kind === "action") {
        expect(operation.title, key).toBeTruthy();
        expect(operation.description, key).toBeTruthy();
        expect(operation.inputSchema?.type, key).toBe("object");
      }
      if (request && (request.method === "GET" || request.method === "DELETE")) {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      } else if (request?.body !== undefined) {
        expect(request.headers?.["Content-Type"], key).toBe(
          request.bodyEncoding === "form" ? "application/x-www-form-urlencoded" : "application/json",
        );
      }
    }
    expect(uncovered).toEqual([]);
    expect(Object.keys(slackCoreActionHandlers).sort()).toEqual(
      [...Object.keys(fixtures), ...depthFixtureOperations].sort(),
    );
  });

  test("keeps a success fixture for every non-webhook operation", () => {
    const covered = new Set([...Object.keys(expandedFixtures), ...Object.keys(fixtures), ...depthFixtureOperations]);
    const missing = Object.entries(operations)
      .filter(([, operation]) => operation.kind !== "webhook")
      .map(([key]) => key)
      .filter((key) => !covered.has(key));
    expect(missing).toEqual([]);
    for (const fixture of Object.values(fixtures)) {
      expect(fixture.body === null || typeof fixture.body === "string").toBe(true);
      if (typeof fixture.body === "string") expect(fixture.body).toBe(JSON.stringify(JSON.parse(fixture.body)));
    }
  });

  test("matches recipe requests for the core operations", () => {
    for (const key of Object.keys(fixtures)) {
      expect(recipe.manifest.operations[key]?.request).toEqual(operations[key]?.request);
    }
  });

  for (const [operation, fixture] of Object.entries(fixtures)) {
    test(`${operation} calls Slack`, async () => {
      const requests: Request[] = [];
      const handler = slackCoreActionHandlers[operation];
      const result = await handler({
        ...fixture.input,
        token: "xoxb-test-token",
        fetch: async (input, init) => {
          requests.push(new Request(input, init));
          return Response.json(fixture.response);
        },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe(fixture.method);
      expect(requests[0].url).toBe(fixture.url);
      expect(requests[0].redirect).toBe("error");
      expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
      if (fixture.body === null) {
        expect(await requests[0].text()).toBe("");
        expect(requests[0].headers.get("Content-Type")).toBeNull();
      } else {
        expect(requests[0].headers.get("Content-Type")).toBe("application/json");
        expect(await requests[0].text()).toBe(fixture.body);
      }
      expect(result.action).toBe(operation);
      expect(result.data).toEqual(fixture.response);
    });
  }

  test("messages.send returns the posted timestamp", async () => {
    const result = await sendMessage({
      token: "xoxb-test-token",
      channel: "C123",
      text: "hello from slack",
      fetch: async () => Response.json({
        ok: true,
        channel: "C123",
        ts: "1715680861.000200",
        message: { text: "hello from slack", ts: "1715680861.000200" },
      }),
    });
    expect(result.providerMessageId).toBe("1715680861.000200");
    expect(result.channelId).toBe("C123");
  });

  test("rejects a missing required field before calling Slack", async () => {
    let fetchCalls = 0;
    await expect(slackCoreActionHandlers["messages.send"]({
      text: "hello",
      token: "xoxb-test-token",
      fetch: async () => {
        fetchCalls += 1;
        return Response.json({ ok: true });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(fetchCalls).toBe(0);
  });

  test("compiles core action requests and treats Slack ok:false as failure", async () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(compiled.actions["messages.send"]).toBeTypeOf("function");
    expect(compiled.actions["healthcheck"]).toBeTypeOf("function");
    expect(compiled.actions["conversations.invite"]).toBeTypeOf("function");
    expect(compiled.actions["messages.list"]).toBeUndefined();

    const requests: Request[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      const url = String(input);
      if (url.endsWith("/api/auth.test")) return Response.json({ ok: true, user_id: "U123" });
      return Response.json({ ok: false, error: "channel_not_found" });
    };
    const health = await compiled.actions["healthcheck"]({ token: "xoxb-test-token", fetch: fetchImpl });
    expect(health).toMatchObject({ source: "provider", data: { ok: true, user_id: "U123" } });
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://slack.com/api/auth.test");
    expect(requests[0].headers.get("content-type")).toBeNull();

    await expect(compiled.actions["messages.send"]({
      token: "xoxb-test-token",
      channel: "C123",
      text: "hello",
      fetch: fetchImpl,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(requests[1].method).toBe("POST");
    expect(requests[1].url).toBe("https://slack.com/api/chat.postMessage");
    expect(await requests[1].text()).toBe("{\"channel\":\"C123\",\"text\":\"hello\"}");
  });
});
