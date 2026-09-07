import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseCalComRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type CalComClientOptions = {
  token: string;
  fetch?: typeof fetch;
  operation?: string;
  calApiVersion?: string;
};

export function createCalComClient(options: CalComClientOptions) {
  const operation = options.operation ?? "bookings.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}, calApiVersion?: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const versionHeader = calApiVersion ?? options.calApiVersion ?? "2024-08-13";
      const response = await httpClient.fetchText(`https://api.cal.com/v2${path}`, {
        ...init,
        headers: {
          "Authorization": `Bearer ${options.token}`,
          "Content-Type": "application/json",
          "cal-api-version": versionHeader,
          ...(init.headers as Record<string, string>),
        },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type CalComClient = ReturnType<typeof createCalComClient>;

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

/** Unwrap cal.com v2 {status:"success", data:{...}} envelope. Returns data if successful, null otherwise. */
export function unwrapEnvelope(body: unknown): unknown {
  if (!isRecord(body)) return body;
  if (body.status === "success" || body.status === "error") {
    return body.data ?? null;
  }
  return body;
}
