import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseResendRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type ResendClientOptions = { apiKey: string; fetch?: typeof fetch; operation?: string };

export function encodeResendPathIdentifier(value: string, field: string): string {
  // Blank, whitespace-only and dot-only (also when padded: ' .. ') ids would
  // reach Resend as an empty, whitespace or dot segment (/segments/%20/contacts).
  const trimmed = value.trim();
  if (!trimmed || /^\.+$/.test(trimmed) || /[\/\\\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new Error(`${field} must be a safe path identifier`);
  }
  return encodeURIComponent(value);
}

export function createResendClient(options: ResendClientOptions) {
  const operation = options.operation ?? "emails.send";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 65536;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.apiKey}`,
        ...(init.headers as Record<string, string> | undefined),
      };
      if (init.body != null && headers["Content-Type"] == null && headers["content-type"] == null) {
        headers["Content-Type"] = "application/json";
      }
      const response = await httpClient.fetchText(`https://api.resend.com${path}`, {
        ...init,
        headers,
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type ResendClient = ReturnType<typeof createResendClient>;
export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
