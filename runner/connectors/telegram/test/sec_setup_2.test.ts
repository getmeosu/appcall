import { describe, expect, test } from "bun:test";
import { outcomeOf } from "../../_shared/test/path_segment_harness";
import { requireBotToken } from "../src/token";

// SEC-SETUP-2 (item 5): the bot token is spliced into /bot<token>/<method>, so
// '?', '#', '/' (and '\', '%', whitespace) are refused before any request.
const BAD = ["123:abc?x=1", "123:abc#frag", "123:abc/../getMe", "123:abc\\x", "123:abc%2f", "123:a b"];

describe("telegram SEC-SETUP-2 botToken shape", () => {
  test("requireBotToken rejects path/query characters and never echoes the token", () => {
    for (const value of BAD) {
      let message = "";
      try { requireBotToken(value); } catch (error) { message = (error as Error).message; }
      expect(message, value).toContain("botToken must not contain");
      expect(message).not.toContain(value);
    }
    expect(requireBotToken(" 123456:AA-bb_CC ")).toBe("123456:AA-bb_CC");
  });
  test("actions, syncs and the healthcheck make no request for a bad token", async () => {
    for (const value of BAD) {
      for (const [op, extra, kind] of [
        ["messages.send", { chatId: "1", text: "hi" }, "action"],
        ["bot.getMe", {}, "action"],
        ["chats.get", { chatId: "1" }, "action"],
        ["healthcheck", {}, "healthcheck"],
      ] as const) {
        const result = await outcomeOf("telegram", op, { ...extra, botToken: value }, kind);
        expect({ value, op, calls: result.calls.length, ok: result.ok }).toEqual({ value, op, calls: 0, ok: false });
      }
    }
  });
  test("a valid token reaches api.telegram.org/bot<token>/getMe", async () => {
    const result = await outcomeOf("telegram", "bot.getMe", { botToken: "123456:AA-bb_CC" });
    expect(result.calls.map((c) => new URL(c.url).pathname)).toEqual(["/bot123456:AA-bb_CC/getMe"]);
  });
});
