// SEC-PATH-2c-3: the bot token is interpolated into the request path
// (https://api.telegram.org/bot<token>/<method>), so it must stay one path
// segment. Telegram tokens are "<numeric bot id>:<secret>", the secret built from letters, digits,
// "_" and "-" (linus ruling: ^\d+:[A-Za-z0-9_-]+$); anything else (blank, whitespace, ".", "/", "%", "?", "#",
// controls) is rejected before any request. The value is never echoed.
const TOKEN_FORMAT = /^\d+:[A-Za-z0-9_-]+$/;

export function telegramBotToken(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "botToken is required" };
  }
  const token = value.trim();
  if (!TOKEN_FORMAT.test(token)) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "botToken is malformed" };
  }
  return token;
}
