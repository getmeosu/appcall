import { createSendGridClient, parseSendGridRateLimit, prop, isRecord } from "./http";

export type GlobalStatsInput = { startDate: string; endDate?: string; aggregatedBy?: string; limit?: number; offset?: number };

export type NormalizedGlobalStat = {
  date: string;
  metrics: Record<string, number>;
  raw: Record<string, unknown>;
};

export function validateGlobalStatsInput(input: unknown): GlobalStatsInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    startDate: requireString(input.startDate, "startDate"),
    endDate: typeof input.endDate === "string" && input.endDate.length ? input.endDate : undefined,
    aggregatedBy: typeof input.aggregatedBy === "string" && input.aggregatedBy.length ? input.aggregatedBy : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

export function normalizeGlobalStat(row: Record<string, unknown>): NormalizedGlobalStat {
  const stats = Array.isArray(row.stats) ? row.stats : [];
  const first = stats.find(isRecord) ?? {};
  const metricsRaw = isRecord(first.metrics) ? first.metrics : {};
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(metricsRaw)) {
    if (typeof value === "number") metrics[key] = value;
  }
  return { date: prop(row, "date"), metrics, raw: row };
}

export type ApiKeysListInput = { limit?: number };
export type NormalizedApiKey = { apiKeyId: string; name: string };

export function validateApiKeysListInput(input: unknown): ApiKeysListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { limit: typeof input.limit === "number" ? input.limit : undefined };
}

export type AlertsListInput = Record<string, never>;
export type NormalizedAlert = {
  id: number;
  type: string;
  emailTo: string;
  percentage?: number;
  frequency?: string;
  createdAt: number;
  updatedAt: number;
  raw: Record<string, unknown>;
};

export function validateAlertsListInput(input: unknown): AlertsListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export function normalizeAlert(row: Record<string, unknown>): NormalizedAlert {
  return {
    id: typeof row.id === "number" ? row.id : 0,
    type: prop(row, "type"),
    emailTo: prop(row, "email_to"),
    percentage: typeof row.percentage === "number" ? row.percentage : undefined,
    frequency: typeof row.frequency === "string" ? row.frequency : undefined,
    createdAt: typeof row.created_at === "number" ? row.created_at : 0,
    updatedAt: typeof row.updated_at === "number" ? row.updated_at : 0,
    raw: row,
  };
}

export function createAdminClient(options: { apiKey: string; fetch?: typeof fetch }) {
  return {
    async getGlobalStats(input: unknown) {
      const payload = validateGlobalStatsInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "stats.global.get" });
      const params = new URLSearchParams();
      params.set("start_date", payload.startDate);
      if (payload.endDate) params.set("end_date", payload.endDate);
      if (payload.aggregatedBy) params.set("aggregated_by", payload.aggregatedBy);
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const response = await client.fetchJSON(`/stats?${params}`);
      if (response.status === 200) {
        const rows = Array.isArray(response.body) ? response.body : [];
        return { ok: true as const, stats: (rows as unknown[]).filter(isRecord).map(normalizeGlobalStat) };
      }
      return fail(response, "SendGrid rejected the global stats request.");
    },

    async listApiKeys(input: unknown) {
      const payload = validateApiKeysListInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "api_keys.list" });
      const qs = payload.limit !== undefined ? `?limit=${encodeURIComponent(String(payload.limit))}` : "";
      const response = await client.fetchJSON(`/api_keys${qs}`);
      if (response.status === 200) {
        const b = isRecord(response.body) ? response.body : {};
        const rows = Array.isArray(b.result) ? b.result : [];
        const apiKeys = (rows as unknown[]).filter(isRecord).map((row) => ({
          apiKeyId: prop(row, "api_key_id"),
          name: prop(row, "name"),
        }));
        return { ok: true as const, apiKeys };
      }
      return fail(response, "SendGrid rejected the API keys list request.");
    },

    async listAlerts(input: unknown) {
      validateAlertsListInput(input);
      const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "alerts.list" });
      const response = await client.fetchJSON("/alerts");
      if (response.status === 200) {
        const rows = Array.isArray(response.body) ? response.body : [];
        return { ok: true as const, alerts: (rows as unknown[]).filter(isRecord).map(normalizeAlert) };
      }
      return fail(response, "SendGrid rejected the alerts list request.");
    },
  };
}

function fail(response: { status: number; headers: Record<string, string> }, message: string) {
  const rl = parseSendGridRateLimit(response.status, response.headers);
  if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
