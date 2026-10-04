import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { sendMessage } from "../src/actions";
import sendMessageFixture from "../fixtures/send_message.json";

const WEBHOOK_OPS = [
  "webhook.message_received",
  "webhook.app_mention",
  "webhook.reaction_added",
  "webhook.reaction_removed",
  "webhook.member_joined_channel",
  "webhook.channel_created",
] as const;

describe("slack webhook operations", () => {
  test("declares each trigger as kind webhook", () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    for (const key of WEBHOOK_OPS) {
      expect(ops[key]).toBeDefined();
      expect(ops[key].kind).toBe("webhook");
    }
  });

  test("messages.send still works", async () => {
    const ops = manifest.operations as Record<string, { kind: string }>;
    expect(ops["messages.send"].kind).toBe("action");

    const requests: Request[] = [];
    const result = await sendMessage({
      token: "xoxb-test-token",
      channel: "C123",
      text: "hello from slack",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(sendMessageFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(result.action).toBe("messages.send");
    expect(result.providerMessageId).toBe("1715680861.000200");
  });
});
