import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import messageFixture from "../fixtures/message.json";
import messagesList from "../fixtures/messages_list.json";
import { mockFetch, jsonBody as body } from "./support";

const { actions } = compileDeclarativeConnector(manifest as never);

describe("messages.list", () => {
  it("reads newest-first history with only the cursor supplied", async () => {
    const { calls, fetchFn } = mockFetch(messagesList);
    const result = (await actions["messages.list"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", limit: 30, after: "1400000000000000000", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages?limit=30&after=1400000000000000000");
    expect(result.messages).toEqual(messagesList);
  });

  it("sends no cursor when none is given", async () => {
    const { calls, fetchFn } = mockFetch(messagesList);
    await actions["messages.list"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages");
  });
});

describe("messages.send and messages.reply", () => {
  it("posts content to a channel", async () => {
    const { calls, fetchFn } = mockFetch(messageFixture);
    const result = (await actions["messages.send"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", content: "Welcome aboard!", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(body(calls)).toEqual({ content: "Welcome aboard!" });
    expect(result.message).toEqual(messageFixture);
  });

  it("replies with a message reference so the thread of conversation is visible", async () => {
    const { calls, fetchFn } = mockFetch(messageFixture);
    await actions["messages.reply"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000003", content: "Settings → Account → Reset.", fetch: fetchFn });
    expect(body(calls)).toEqual({ content: "Settings → Account → Reset.", message_reference: { message_id: "1400000000000000003" }, allowed_mentions: { replied_user: true } });
  });

  it("requires content", () => {
    expect(() => actions["messages.send"]!({ channelId: "1300000000000000001" })).toThrow("content is required");
  });
});

describe("edit, delete, pins", () => {
  it("edits content in place", async () => {
    const { calls, fetchFn } = mockFetch(messageFixture);
    await actions["messages.edit"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", content: "Welcome!", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("PATCH");
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages/1400000000000000001");
  });

  it("deletes one message with an audit reason and reports it", async () => {
    const { calls, fetchFn } = mockFetch("", 204);
    const result = (await actions["messages.delete"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000003", reason: "Rule 2: no spam", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages/1400000000000000003");
    expect((calls[0]!.init?.headers as Record<string, string>)["X-Audit-Log-Reason"]).toBe("Rule 2: no spam");
    expect(result.deleted).toBe(true);
  });

  it("bulk-deletes by id list and is destructive", async () => {
    const { calls, fetchFn } = mockFetch("", 204);
    await actions["messages.bulkDelete"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageIds: ["1400000000000000001", "1400000000000000002"], fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages/bulk-delete");
    expect(body(calls)).toEqual({ messages: ["1400000000000000001", "1400000000000000002"] });
    expect((manifest.operations as Record<string, { sideEffect: string }>)["messages.bulkDelete"]!.sideEffect).toBe("destructive");
  });

  it("pins, unpins and lists pins", async () => {
    const pin = mockFetch("", 204);
    await actions["messages.pin"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", fetch: pin.fetchFn });
    expect(pin.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/pins/1400000000000000001");
    expect(pin.calls[0]!.init?.method).toBe("PUT");

    const unpin = mockFetch("", 204);
    await actions["messages.unpin"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", fetch: unpin.fetchFn });
    expect(unpin.calls[0]!.init?.method).toBe("DELETE");

    const list = mockFetch([messageFixture]);
    const result = (await actions["messages.listPinned"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", fetch: list.fetchFn })) as Record<string, unknown>;
    expect(list.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/pins");
    expect(result.messages).toEqual([messageFixture]);
  });
});
