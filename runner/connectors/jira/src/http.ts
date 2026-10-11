import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type JiraRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseJiraRateLimit(status: number, headers: Record<string, string>): JiraRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    if (retryAfter > 0 && Number.isFinite(retryAfter)) {
      return { limited: true, retryAfterSeconds: retryAfter };
    }
    return { limited: true, retryAfterSeconds: 30 };
  }
  return { limited: false };
}

export type JiraCloudResource = {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
};

export async function fetchCloudResources(accessToken: string, fetchFn?: typeof fetch): Promise<JiraCloudResource[]> {
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: 65536,
    fetch: fetchFn,
  });
  const response = await httpClient.fetchText("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status !== 200) return [];
  const body = JSON.parse(response.body);
  if (!Array.isArray(body)) return [];
  return body.map((r: any) => ({
    id: r.id ?? "",
    name: r.name ?? "",
    url: r.url ?? "",
    scopes: Array.isArray(r.scopes) ? r.scopes : [],
    avatarUrl: r.avatarUrl ?? "",
  }));
}

export type JiraApiFamily = "api3" | "agile" | "servicedesk";

export type JiraClientOptions = {
  accessToken: string;
  cloudId: string;
  fetch?: typeof fetch;
  operation?: string;
  family?: JiraApiFamily;
};

function restBase(cloudId: string, family: JiraApiFamily): string {
  if (family === "agile") return `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0`;
  if (family === "servicedesk") return `https://api.atlassian.com/ex/jira/${cloudId}/rest/servicedeskapi`;
  return `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;
}

export function createJiraClient(options: JiraClientOptions) {
  const operation = options.operation ?? "issues.search";
  const family = options.family ?? "api3";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });
  const baseUrl = restBase(options.cloudId, family);

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
      const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.accessToken}`,
        ...(init.headers as Record<string, string> | undefined),
      };
      if (!isForm && !headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      if (family === "servicedesk" && !headers["X-ExperimentalApi"]) {
        headers["X-ExperimentalApi"] = "opt-in";
      }
      const response = await httpClient.fetchText(url, { ...init, headers });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type JiraClient = ReturnType<typeof createJiraClient>;

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string {
  const val = obj[field];
  return typeof val === "string" ? val : fallback;
}

export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

export function extractAdfText(adf: unknown): string {
  if (typeof adf === "string") return adf;
  if (!isRecord(adf)) return "";
  const content = adf.content;
  if (!Array.isArray(content)) return "";
  return content.map((node: any) => {
    if (typeof node === "string") return node;
    if (isRecord(node) && node.type === "text" && typeof node.text === "string") return node.text;
    if (isRecord(node) && Array.isArray(node.content)) return extractAdfText(node);
    return "";
  }).join("");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pickValue(obj: Record<string, unknown>, aliases: string[]): unknown {
  for (const key of aliases) {
    const val = obj[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}

export function pickStr(obj: Record<string, unknown>, ...aliases: string[]): string | undefined {
  const val = pickValue(obj, aliases);
  if (typeof val === "string" && val.length > 0) return val;
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  return undefined;
}

export function pickNum(obj: Record<string, unknown>, ...aliases: string[]): number | undefined {
  const val = pickValue(obj, aliases);
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.length > 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function pickBool(obj: Record<string, unknown>, ...aliases: string[]): boolean | undefined {
  const val = pickValue(obj, aliases);
  if (typeof val === "boolean") return val;
  return undefined;
}

export function adfDoc(text: string): Record<string, unknown> {
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

export function asAdf(value: unknown): unknown {
  if (typeof value === "string") return adfDoc(value);
  if (isRecord(value)) return value;
  return undefined;
}
