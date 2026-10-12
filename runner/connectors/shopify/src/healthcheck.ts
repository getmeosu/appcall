import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";
import { SHOPIFY_ADMIN_API_PREFIX } from "./http";

// HEALTH-1: a credentialed healthcheck must prove the token against Shopify.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

export function normalizeShop(raw: string): string {
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\.myshopify\.com$/i, "").toLowerCase();
}

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  const shop = normalizeShop(stringField(input, "shopDomain"));
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(shop)) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", "Shopify shopDomain is missing or invalid in the healthcheck input.");
  }
  const host = `${shop}.myshopify.com`;
  // GET /admin/api/{version}/shop.json (Admin REST "Shop" resource, no scope required).
  const body = await probeProvider({
    provider: "Shopify",
    url: `https://${host}${SHOPIFY_ADMIN_API_PREFIX}/shop.json`,
    headers: { Accept: "application/json", "X-Shopify-Access-Token": token },
    allowedHosts: [host],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
    defaultRetryAfterSeconds: 2,
  });
  const info = isRecord(body) ? body.shop : undefined;
  if (!isRecord(info) || typeof info.id !== "number" || String(info.myshopify_domain ?? "").toLowerCase() !== host) {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "Shopify healthcheck body did not contain this shop.");
  }
  return { status: "ok", source: "provider" };
}
