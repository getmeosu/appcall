import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G5: user codespaces get/update + email delete/visibility + org memberships list (5 ops).
// All omit effectPolicy/reconcile/effect. update omits Reconcile: PATCH machine is string,
// GET returns machine object — not an exact observe.

type Page = { perPage?: number; page?: number };
type CodespaceName = { codespaceName: string };

const VISIBILITIES = ["public", "private"] as const;
const MEMBERSHIP_STATES = ["active", "pending"] as const;

export type NormalizedCodespaceDetail = {
  id: number;
  name: string;
  displayName: string;
  state: string;
  machineName: string;
  recentFolders: string[];
};

export type NormalizedEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string;
};

export type NormalizedOrgMembership = {
  url: string;
  state: string;
  role: string;
  organizationLogin: string;
  organizationId: number;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateGetUserCodespaceInput(input: unknown): CodespaceName {
  if (!isRecord(input)) throw new Error("user.codespaces.get input must be an object");
  return { codespaceName: segment(input.codespaceName ?? input.codespace_name, "codespaceName") };
}

export function validateUpdateUserCodespaceInput(input: unknown): CodespaceName & {
  machine?: string;
  displayName?: string;
  recentFolders?: string[];
} {
  if (!isRecord(input)) throw new Error("user.codespaces.update input must be an object");
  const out: CodespaceName & { machine?: string; displayName?: string; recentFolders?: string[] } = {
    codespaceName: segment(input.codespaceName ?? input.codespace_name, "codespaceName"),
  };
  if (input.machine !== undefined) out.machine = requireNonEmpty(input.machine, "machine");
  if (input.displayName !== undefined || input.display_name !== undefined) {
    out.displayName = requireNonEmpty(input.displayName ?? input.display_name, "displayName");
  }
  if (input.recentFolders !== undefined || input.recent_folders !== undefined) {
    out.recentFolders = stringList(input.recentFolders ?? input.recent_folders, "recentFolders");
  }
  if (out.machine === undefined && out.displayName === undefined && out.recentFolders === undefined) {
    throw new Error("user.codespaces.update requires at least one of machine, displayName, recentFolders");
  }
  return out;
}

export function validateDeleteUserEmailsInput(input: unknown): { emails: string[] } {
  if (!isRecord(input)) throw new Error("user.emails.delete input must be an object");
  return { emails: stringList(input.emails, "emails") };
}

export function validateSetPrimaryEmailVisibilityInput(input: unknown): { visibility: "public" | "private" } {
  if (!isRecord(input)) throw new Error("user.email.visibility.set input must be an object");
  const visibility = input.visibility;
  if (typeof visibility !== "string" || !(VISIBILITIES as readonly string[]).includes(visibility)) {
    throw new Error("visibility must be public or private");
  }
  return { visibility: visibility as "public" | "private" };
}

export function validateListOrgMembershipsInput(input: unknown): Page & { state?: "active" | "pending" } {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("user.memberships.orgs.list input must be an object");
  const out: Page & { state?: "active" | "pending" } = { ...page(input) };
  if (input.state !== undefined) {
    if (typeof input.state !== "string" || !(MEMBERSHIP_STATES as readonly string[]).includes(input.state)) {
      throw new Error("state must be active or pending");
    }
    out.state = input.state as "active" | "pending";
  }
  return out;
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG5Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getUserCodespace(input: unknown) {
      const payload = validateGetUserCodespaceInput(input);
      const result = await read(
        clientFor("user.codespaces.get"),
        `/user/codespaces/${enc(payload.codespaceName)}`,
        "user.codespaces.get",
        "GitHub codespace was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the user.codespaces.get request.");
      return { ok: true as const, codespace: normalizeCodespace(result.body) };
    },

    async updateUserCodespace(input: unknown) {
      const payload = validateUpdateUserCodespaceInput(input);
      const body: Record<string, unknown> = {};
      if (payload.machine !== undefined) body.machine = payload.machine;
      if (payload.displayName !== undefined) body.display_name = payload.displayName;
      if (payload.recentFolders !== undefined) body.recent_folders = payload.recentFolders;
      const response = await clientFor("user.codespaces.update").fetchJSON(
        `/user/codespaces/${enc(payload.codespaceName)}`,
        jsonInit("PATCH", body),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, codespace: normalizeCodespace(response.body) };
      }
      if (response.status === 404) return upstream("GitHub codespace was not found.");
      return upstream("GitHub rejected the user.codespaces.update request.");
    },

    async deleteUserEmails(input: unknown) {
      const payload = validateDeleteUserEmailsInput(input);
      const response = await clientFor("user.emails.delete").fetchJSON(
        "/user/emails",
        jsonInit("DELETE", { emails: payload.emails }),
      );
      return noContent(
        response,
        204,
        { deleted: true, emails: payload.emails },
        "GitHub email address was not found.",
        "GitHub rejected the user.emails.delete request.",
      );
    },

    async setPrimaryEmailVisibility(input: unknown) {
      const payload = validateSetPrimaryEmailVisibilityInput(input);
      const response = await clientFor("user.email.visibility.set").fetchJSON(
        "/user/email/visibility",
        jsonInit("PATCH", { visibility: payload.visibility }),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && Array.isArray(response.body)) {
        return {
          ok: true as const,
          emails: response.body.filter(isRecord).map(normalizeEmail),
        };
      }
      if (response.status === 404) return upstream("GitHub primary email was not found.");
      return upstream("GitHub rejected the user.email.visibility.set request.");
    },

    async listOrgMemberships(input: unknown) {
      const payload = validateListOrgMembershipsInput(input);
      const params = new URLSearchParams();
      if (payload.state) params.set("state", payload.state);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString();
      const result = await read(
        clientFor("user.memberships.orgs.list"),
        `/user/memberships/orgs${qs ? `?${qs}` : ""}`,
        "user.memberships.orgs.list",
        "GitHub organization memberships were not found.",
      );
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the user.memberships.orgs.list request.");
      return {
        ok: true as const,
        memberships: result.body.filter(isRecord).map(normalizeMembership),
      };
    },
  };
}

// ─── normalizers / helpers ───────────────────────────────────────────────────

function normalizeCodespace(item: Record<string, unknown>): NormalizedCodespaceDetail {
  const machine = isRecord(item.machine) ? item.machine : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    displayName: typeof item.display_name === "string" ? item.display_name : "",
    state: typeof item.state === "string" ? item.state : "",
    machineName: typeof machine.name === "string" ? machine.name : "",
    recentFolders: Array.isArray(item.recent_folders)
      ? item.recent_folders.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function normalizeEmail(item: Record<string, unknown>): NormalizedEmail {
  return {
    email: typeof item.email === "string" ? item.email : "",
    primary: item.primary === true,
    verified: item.verified === true,
    visibility: typeof item.visibility === "string" ? item.visibility : "",
  };
}

function normalizeMembership(item: Record<string, unknown>): NormalizedOrgMembership {
  const org = isRecord(item.organization) ? item.organization : {};
  return {
    url: typeof item.url === "string" ? item.url : "",
    state: typeof item.state === "string" ? item.state : "",
    role: typeof item.role === "string" ? item.role : "",
    organizationLogin: typeof org.login === "string" ? org.login : "",
    organizationId: typeof org.id === "number" ? org.id : 0,
  };
}

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
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
  return {
    ok: false as const,
    error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message, retryAfterSeconds: undefined as number | undefined },
  };
}

function page(input: Record<string, unknown>): Page {
  const perPage = optionalPage(input.perPage, "perPage");
  const pageNumber = optionalPage(input.page, "page", 1_000_000);
  return { ...(perPage !== undefined ? { perPage } : {}), ...(pageNumber !== undefined ? { page: pageNumber } : {}) };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be a non-empty array of non-empty strings`);
  }
  return value as string[];
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
