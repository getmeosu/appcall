import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { resolveOAuthHost } from "./oauth";

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

export type MailchimpClientOptions = ({ apiKey: string; accessToken?: undefined } | { apiKey?: undefined; accessToken: string }) & { host?: string; fetch?: typeof fetch; operation?: string };

function mailchimpHost(options: { apiKey: string; host?: string }): string {
  const raw = typeof options.host === "string" && options.host.trim() ? options.host.trim() : `${extractDataCenter(options.apiKey)}.api.mailchimp.com`;
  return raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

export function createMailchimpClient(options: MailchimpClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  // API key: key-dc host and Basic auth (unchanged). OAuth (MC-OAUTH-1): the
  // host comes from the metadata endpoint and the token is sent as Bearer.
  const apiKey = typeof options.apiKey === "string" && options.apiKey !== "" ? options.apiKey : undefined;
  const resolve = async (): Promise<{ host: string; authorization: string }> => apiKey !== undefined
    ? { host: mailchimpHost({ apiKey, host: options.host }), authorization: `Basic ${btoa(`anystring:${apiKey}`)}` }
    : { host: await resolveOAuthHost(String(options.accessToken), options.fetch), authorization: `Bearer ${options.accessToken}` };
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const { host, authorization } = await resolve();
      const allowedHosts = (manifest.network.allowedHosts as string[]).map((entry) => entry.replaceAll("{{host}}", host));
      const httpClient = createConnectorHttpClient({
        allowedHosts,
        maxResponseBytes,
        fetch: options.fetch,
      });
      const headers: Record<string, string> = {
        Authorization: authorization,
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
