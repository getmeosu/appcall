import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseApolloRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["x-ratelimit-reset"] ?? "60");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 60 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type ApolloClientOptions = { apiKey: string; fetch?: typeof fetch; operation?: string };

export function createApolloClient(options: ApolloClientOptions) {
  const operation = options.operation ?? "people.search";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://api.apollo.io${path}`, {
        ...init,
        headers: {
          "X-Api-Key": options.apiKey,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type ApolloClient = ReturnType<typeof createApolloClient>;

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string {
  const v = obj[field];
  return typeof v === "string" ? v : fallback;
}

export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number {
  const v = obj[field];
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
