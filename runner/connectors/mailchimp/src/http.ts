import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseMailchimpRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const reset = Number(headers["x-ratelimit-reset"] ?? "0");
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = Math.max(0, reset - now);
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export function extractDataCenter(apiKey: string): string {
  const match = apiKey.match(/^([a-z]+[0-9]+)[a-f0-9]+$/);
  return match ? match[1] : "us1";
}

export type MailchimpClientOptions = { apiKey: string; host?: string; fetch?: typeof fetch; operation?: string };

function mailchimpHost(options: MailchimpClientOptions): string {
  const raw = typeof options.host === "string" && options.host.trim() ? options.host.trim() : `${extractDataCenter(options.apiKey)}.api.mailchimp.com`;
  return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

export function createMailchimpClient(options: MailchimpClientOptions) {
  const host = mailchimpHost(options);
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const allowedHosts = (manifest.network.allowedHosts as string[]).map((entry) => entry.replaceAll("{{host}}", host));
  const httpClient = createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes,
    fetch: options.fetch,
  });
  const encoded = btoa(`anystring:${options.apiKey}`);
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const headers: Record<string, string> = {
        Authorization: `Basic ${encoded}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined),
      };
      const response = await httpClient.fetchText(`https://${host}/3.0${path}`, {
        ...init,
        headers,
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type MailchimpClient = ReturnType<typeof createMailchimpClient>;

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string {
  const val = obj[field];
  return typeof val === "string" ? val : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
