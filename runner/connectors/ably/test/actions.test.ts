import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200) =>
  new Response(body === "" ? "" : JSON.stringify(body), { status });

describe("ably HTTP contract", () => {
  test("healthcheck uses Basic auth and empty input", async () => {
    const seen: Request[] = [];
    const out = await actions.healthcheck!({
      keyName: "fixture-key",
      keySecret: "fixture-api-token",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ intervalId: "2026-09-13T00:00:00Z", unit: "day", messages: 1 }]);
      },
    });
    expect(seen[0]!.method).toBe("GET");
    expect(seen[0]!.url).toBe("https://main.realtime.ably.net/stats?limit=1");
    expect(seen[0]!.headers.get("authorization")).toMatch(/^Basic /);
    expect(out).toMatchObject({ source: "provider" });
  });

  test("publishes a channel message and lists channels", async () => {
    const seen: Request[] = [];
    await actions["messages.publish"]!({
      keyName: "fixture-key",
      keySecret: "fixture-api-token",
      channelId: "alerts",
      name: "ping",
      data: "ok",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response("", 201);
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.url).toBe("https://main.realtime.ably.net/channels/alerts/messages");
    expect(await seen[0]!.json()).toEqual({ name: "ping", data: "ok" });

    seen.length = 0;
    const listed = await actions["channels.list"]!({
      keyName: "fixture-key",
      keySecret: "fixture-api-token",
      limit: 10,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ channelId: "alerts" }]);
      },
    });
    expect(seen[0]!.url).toBe("https://main.realtime.ably.net/channels?limit=10");
    expect(listed).toMatchObject({ source: "provider", data: [{ channelId: "alerts" }] });
  });

  test("rejects invalid input and maps 429", async () => {
    await expect(
      actions["channels.get"]!({
        keyName: "fixture-key",
        keySecret: "fixture-api-token",
        channelId: "",
        fetch: async () => response({}),
      }),
    ).rejects.toBeDefined();
    await expect(
      actions["stats.get"]!({
        keyName: "fixture-key",
        keySecret: "fixture-api-token",
        fetch: async () => response({ message: "slow" }, 429),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
