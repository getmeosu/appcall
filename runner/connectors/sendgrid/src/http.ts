import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseSendGridRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const reset = Number(headers["x-ratelimit-reset"] ?? "0");
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = Math.max(0, reset - now);
    if (retryAfter > 0) return { limited: true, retryAfterSeconds: retryAfter };
    const ra = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: ra > 0 ? ra : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type SendGridClientOptions = { apiKey: string; fetch?: typeof fetch; operation?: string };

export function createSendGridClient(options: SendGridClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://api.sendgrid.com/v3${path}`, {
        ...init, headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type SendGridClient = ReturnType<typeof createSendGridClient>;
export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
