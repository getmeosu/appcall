import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("telegram manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("telegram");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("declares depth actions covering primary resources", () => {
    const ops = Object.keys(operations);
    for (const op of [
      "messages.send", "messages.sendPhoto", "messages.sendDocument", "messages.edit",
      "messages.delete", "messages.forward", "messages.pin", "messages.sendLocation",
      "messages.sendPoll", "messages.unpin", "messages.copy",
      "chats.get", "chats.getMemberCount", "chats.sendAction", "chats.getMember",
      "chats.getAdministrators", "chats.exportInviteLink", "chats.leave",
      "bot.getMe", "bot.getUpdates", "bot.setCommands", "bot.answerCallbackQuery",
    ]) {
      expect(ops).toContain(op);
    }
  });

  it("gives every action title, description, and object inputSchema", () => {
    const actions = Object.entries(operations).filter(([, op]) => op.kind === "action");
    expect(actions.length).toBeGreaterThanOrEqual(16);
    expect(actions.length).toBeLessThanOrEqual(24);
    for (const [key, operation] of actions) {
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
    }
  });

  it("declares EventOnly telegram webhooks with sideEffect read", () => {
    for (const key of [
      "webhook.message",
      "webhook.edited_message",
      "webhook.callback_query",
      "webhook.channel_post",
      "webhook.my_chat_member",
    ]) {
      const operation = operations[key]!;
      expect(operation.kind).toBe("webhook");
      expect(operation.sideEffect).toBe("read");
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect(operation.inputSchema).toBeUndefined();
    }
  });
});
