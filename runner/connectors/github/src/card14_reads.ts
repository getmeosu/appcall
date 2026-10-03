import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type NormalizedLicense = {
  key: string;
  name: string;
  spdxId: string;
  url: string;
  nodeId: string;
  htmlUrl: string;
  description: string;
  implementation: string;
  permissions: string[];
  conditions: string[];
  limitations: string[];
  body: string;
  featured: boolean;
};

export type NormalizedGitignoreTemplate = {
  name: string;
  source: string;
};

export function validateGetZenInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("meta.zen.get input must be an object");
  return {};
}

export function validateGetLicenseInput(input: unknown): { license: string } {
  if (!isRecord(input)) throw new Error("licenses.get input must be an object");
  return { license: segment(input.license, "license") };
}

export function validateGetGitignoreTemplateInput(input: unknown): { name: string } {
  if (!isRecord(input)) throw new Error("gitignore.templates.get input must be an object");
  return { name: segment(input.name, "name") };
}

export function createCard14ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "meta.zen.get",
  });

  return {
    async getZen(input: unknown) {
      validateGetZenInput(input);
      const response = await client.fetchJSON("/zen");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("GitHub zen was not found.");
      if (response.status === 401) return upstream("GitHub rejected the meta.zen.get request.");
      if (response.status === 200) {
        // Official docs: GET /zen returns plain text, not JSON. fetchJSON keeps the raw text when parse fails.
        const text = typeof response.body === "string" ? response.body : String(response.body ?? "");
        return { ok: true as const, text };
      }
      return upstream("GitHub rejected the meta.zen.get request.");
    },

    async getLicense(input: unknown) {
      const payload = validateGetLicenseInput(input);
      const response = await client.fetchJSON(`/licenses/${encodeURIComponent(payload.license)}`);
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("License not found.");
      if (response.status === 401) return upstream("GitHub rejected the licenses.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, license: normalizeLicense(response.body) };
      }
      return upstream("GitHub rejected the licenses.get request.");
    },

    async getGitignoreTemplate(input: unknown) {
      const payload = validateGetGitignoreTemplateInput(input);
      const response = await client.fetchJSON(`/gitignore/templates/${encodeURIComponent(payload.name)}`);
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Gitignore template not found.");
      if (response.status === 401) return upstream("GitHub rejected the gitignore.templates.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, template: normalizeGitignoreTemplate(response.body) };
      }
      return upstream("GitHub rejected the gitignore.templates.get request.");
    },
  };
}

function normalizeLicense(item: Record<string, unknown>): NormalizedLicense {
  return {
    key: typeof item.key === "string" ? item.key : "",
    name: typeof item.name === "string" ? item.name : "",
    spdxId: typeof item.spdx_id === "string" ? item.spdx_id : "",
    url: typeof item.url === "string" ? item.url : "",
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    description: typeof item.description === "string" ? item.description : "",
    implementation: typeof item.implementation === "string" ? item.implementation : "",
    permissions: stringArray(item.permissions),
    conditions: stringArray(item.conditions),
    limitations: stringArray(item.limitations),
    body: typeof item.body === "string" ? item.body : "",
    featured: item.featured === true,
  };
}

function normalizeGitignoreTemplate(item: Record<string, unknown>): NormalizedGitignoreTemplate {
  return {
    name: typeof item.name === "string" ? item.name : "",
    source: typeof item.source === "string" ? item.source : "",
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function rate(status: number, headers: Record<string, string>) {
  const parsed = parseGitHubRateLimit(status, headers);
  if (!parsed.limited) return null;
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
