// SEC-SETUP-2: the bot token is spliced into the request path
// (https://api.telegram.org/bot<token>/<method>), so a stored value carrying
// '?', '#', '/', '\\', '%' or whitespace could change the method or query.
// Real tokens are "<digits>:<base64url>", which never contain these.
export function requireBotToken(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("botToken is required");
  const token = value.trim();
  if (/[?#/\\\s%]/.test(token)) throw new Error("botToken must not contain '?', '#', '/', '\\', '%' or whitespace");
  return token;
}
