import { describe, expect, test } from "bun:test";
import {
  ConnectorHttpError,
  createConnectorHttpClient,
} from "../src/http";

describe("connector outbound HTTP boundary", () => {
  test("rejects hosts outside the connector allowlist before dispatch", async () => {
    let dispatched = false;
    const client = createConnectorHttpClient({
      allowedHosts: ["api.telegram.org"],
      maxResponseBytes: 1024,
      fetch: () => {
        dispatched = true;
        return Promise.resolve(new Response("should not fetch"));
      },
    });

    await expect(client.fetchText("https://example.com/bot/sendMessage")).rejects.toMatchObject({
      code: "OUTBOUND_HOST_NOT_ALLOWED",
      message: "Outbound host is not allowed for this connector.",
    });
    expect(dispatched).toBe(false);
  });

  test("allows exact manifest hosts and returns bounded response metadata", async () => {
    const client = createConnectorHttpClient({
      allowedHosts: ["api.telegram.org"],
      maxResponseBytes: 32,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.telegram.org/bot/sendMessage");
        expect(init?.redirect).toBe("manual");
        return new Response("ok", {
          status: 201,
          headers: { "content-type": "text/plain" },
        });
      },
    });

    const response = await client.fetchText("https://api.telegram.org/bot/sendMessage");

    expect(response).toEqual({
      status: 201,
      headers: { "content-type": "text/plain" },
      body: "ok",
    });
  });

  test("rejects responses larger than the connector operation limit", async () => {
    const client = createConnectorHttpClient({
      allowedHosts: ["slack.com"],
      maxResponseBytes: 4,
      fetch: async () => new Response("12345"),
    });

    await expect(client.fetchText("https://slack.com/api/chat.postMessage")).rejects.toBeInstanceOf(
      ConnectorHttpError,
    );
    await expect(client.fetchText("https://slack.com/api/chat.postMessage")).rejects.toMatchObject({
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
      message: "Outbound response exceeded the configured byte limit.",
    });
  });

  test("cancels a streaming response after the byte limit is crossed", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1234"));
        controller.enqueue(new TextEncoder().encode("5"));
      },
      cancel() {
        canceled = true;
      },
    });
    const client = createConnectorHttpClient({
      allowedHosts: ["slack.com"],
      maxResponseBytes: 4,
      fetch: async () => new Response(body),
    });

    await expect(client.fetchText("https://slack.com/api/chat.postMessage")).rejects.toMatchObject({
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
    expect(canceled).toBe(true);
  });

  test("does not treat an allowed-host suffix as an allowed host", async () => {
    let dispatched = false;
    const client = createConnectorHttpClient({
      allowedHosts: ["api.telegram.org"],
      maxResponseBytes: 1024,
      fetch: async () => {
        dispatched = true;
        return new Response("should not fetch");
      },
    });

    await expect(client.fetchText("https://api.telegram.org.attacker.example/bot/getMe"))
      .rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
    expect(dispatched).toBe(false);
  });

  test("rejects redirect responses instead of following them to unchecked hosts", async () => {
    const client = createConnectorHttpClient({
      allowedHosts: ["slack.com"],
      maxResponseBytes: 1024,
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/redirected" },
        }),
    });

    await expect(client.fetchText("https://slack.com/api/chat.postMessage")).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
      message: "Outbound redirects are blocked by the connector HTTP boundary.",
    });
  });
});
