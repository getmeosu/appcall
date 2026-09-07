import { describe, expect, test } from "bun:test";
import sendMessageFixture from "../fixtures/send_message.json";
import { sendMessage } from "../src/actions";

describe("slack connector actions", () => {
  test("sendMessage validates input and marks connector-owned output", () => {
    const result = sendMessage({ channel: "C123", text: "hello" });

    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({ channel: "C123", text: "hello" });
  });

  test("sendMessage rejects invalid input", () => {
    expect(() => sendMessage({ channel: "", text: "hello" })).toThrow();
  });

  test("sendMessage posts to Slack chat.postMessage with connector-owned raw HTTP", async () => {
    const requests: Request[] = [];
    const result = await sendMessage({
      token: "xoxb-test-token",
      channel: "C123",
      text: "hello from slack",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(await requests[0].json()).toEqual({ channel: "C123", text: "hello from slack" });
    expect(result).toEqual({
      connector: "slack",
      action: "messages.send",
      source: "connector",
      providerMessageId: "1715680861.000200",
      channelId: "C123",
      text: "hello from slack",
      raw: sendMessageFixture.message,
    });
  });

  test("sendMessage rejects Slack rate limits with retry metadata", async () => {
    await expect(sendMessage({
      token: "xoxb-test-token",
      channel: "C123",
      text: "hello",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "15" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      retryAfterSeconds: 15,
    });
  });
});
