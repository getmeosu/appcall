import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseShopifyRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "2");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 2 };
  }
  if (status === 200) {
    const limitHeader = headers["x-shopify-shop-api-call-limit"] ?? "";
    const match = limitHeader.match(/^(\d+)\/(\d+)$/);
    if (match) {
      const used = Number(match[1]);
      const limit = Number(match[2]);
      if (used >= limit) {
        return { limited: true, retryAfterSeconds: 2 };
      }
    }
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type ShopifyClientOptions = { accessToken: string; shopDomain: string; fetch?: typeof fetch; operation?: string };

export function createShopifyClient(options: ShopifyClientOptions) {
  const operation = options.operation ?? "products.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const shop = options.shopDomain.replace(/\.myshopify\.com$/, "").replace(/^https?:\/\//, "").toLowerCase();
  const baseUrl = `https://${shop}.myshopify.com`;
  const httpClient = createConnectorHttpClient({ allowedHosts: [`${shop}.myshopify.com`], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${baseUrl}/admin/api/2025-01${path}`, {
        ...init, headers: { "X-Shopify-Access-Token": options.accessToken, "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type ShopifyClient = ReturnType<typeof createShopifyClient>;
export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number { const v = obj[field]; if (typeof v === "number") return v; if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : fallback; } return fallback; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
