import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { executionContext } from "../../../bun/src/execution";
import { hostIsAllowed } from "../../../bun/src/http";
import manifest from "../manifest.json";

type Repo = { owner: string; repo: string };
type Page = { perPage?: number; page?: number };
type RepoPage = Repo & Page;
type OrgPage = { org: string } & Page;
type UserPage = { username: string } & Page;
type ProjectItem = { projectNumber: number; itemId: number };
type OrgProjectItem = { org: string } & ProjectItem;
type UserProjectItem = { username: string } & ProjectItem;
type UserProjectItems = { username: string; projectNumber: number } & Page;
type UserViewItems = { username: string; projectNumber: number; viewNumber: number } & Page;

export function validateGetMetaRootInput(input: unknown): Record<string, never> {
  return emptyInput(input, "meta.root.get");
}

export function validateGetRepoDependencyGraphSbomInput(input: unknown): Repo {
  if (!isRecord(input)) throw new Error("repos.dependency_graph.sbom.get input must be an object");
  return repo(input);
}

export function validateGetCodeqlDatabaseInput(input: unknown): Repo & { language: string } {
  if (!isRecord(input)) throw new Error("code_scanning.codeql.databases.get input must be an object");
  return { ...repo(input), language: requireSingleSegment(input.language, "language") };
}

export function validateGetCodeScanningDefaultSetupInput(input: unknown): Repo {
  if (!isRecord(input)) throw new Error("code_scanning.default_setup.get input must be an object");
  return repo(input);
}

export function validateGetOrgPropertySchemaInput(input: unknown): { org: string; customPropertyName: string } {
  if (!isRecord(input)) throw new Error("orgs.properties.schema.get input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    customPropertyName: requireSingleSegment(input.customPropertyName, "customPropertyName"),
  };
}

export function validateGetOrgProjectItemInput(input: unknown): OrgProjectItem {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.items.get input must be an object");
  return { org: requireSingleSegment(input.org, "org"), ...projectItem(input) };
}

export function validateGetRepoPagesHealthInput(input: unknown): Repo {
  if (!isRecord(input)) throw new Error("repos.pages.health.get input must be an object");
  return repo(input);
}

export function validateGetRepoPagesInput(input: unknown): Repo {
  if (!isRecord(input)) throw new Error("repos.pages.get input must be an object");
  return repo(input);
}

export function validateGetUserProjectItemInput(input: unknown): UserProjectItem {
  if (!isRecord(input)) throw new Error("users.projects_v2.items.get input must be an object");
  return { username: requireSingleSegment(input.username, "username"), ...projectItem(input) };
}

export function validateListRepoIssueTypesInput(input: unknown): RepoPage {
  if (!isRecord(input)) throw new Error("repos.issue_types.list input must be an object");
  return { ...repo(input), ...page(input) };
}

export function validateListOrgProjectsInput(input: unknown): OrgPage {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.list input must be an object");
  return { org: requireSingleSegment(input.org, "org"), ...page(input) };
}

export function validateListUserProjectItemsInput(input: unknown): UserProjectItems {
  if (!isRecord(input)) throw new Error("users.projects_v2.items.list input must be an object");
  return {
    username: requireSingleSegment(input.username, "username"),
    projectNumber: requireId(input.projectNumber, "projectNumber"),
    ...page(input),
  };
}

export function validateListUserProjectViewItemsInput(input: unknown): UserViewItems {
  if (!isRecord(input)) throw new Error("users.projects_v2.views.items.list input must be an object");
  return {
    username: requireSingleSegment(input.username, "username"),
    projectNumber: requireId(input.projectNumber, "projectNumber"),
    viewNumber: requireId(input.viewNumber, "viewNumber"),
    ...page(input),
  };
}

export function validateListUserProjectsInput(input: unknown): UserPage {
  if (!isRecord(input)) throw new Error("users.projects_v2.list input must be an object");
  return { username: requireSingleSegment(input.username, "username"), ...page(input) };
}

export function createCard19ReadsClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
  /** Test seam: override poll sleep (default 2000ms between fetch-report polls). */
  sleep?: (ms: number) => Promise<void>;
}) {
  const fetchImpl = options.fetch ?? fetch;
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "meta.root.get",
  });
  const sleep = options.sleep ?? sleepMs;

  return {
    async getMetaRoot(input: unknown) {
      validateGetMetaRootInput(input);
      const response = await client.fetchJSON("/");
      return readObject(response, "root", "API root not found.", "GitHub rejected the API root request.");
    },
    async getRepoDependencyGraphSbom(input: unknown) {
      const payload = validateGetRepoDependencyGraphSbomInput(input);
      const base = `${repoPath(payload)}/dependency-graph/sbom`;
      // Async flow (sync GET …/sbom removed 2026-11-13): generate-report → poll fetch-report → follow Location → SPDX.
      const generated = await client.fetchJSON(`${base}/generate-report`);
      if (generated.status === 404) return upstream("Dependency graph SBOM not found.");
      if (generated.status !== 201 || !isRecord(generated.body)) {
        return mapRateOrUpstream(generated, "GitHub rejected the dependency graph SBOM generate-report request.");
      }
      const sbomUrl = generated.body.sbom_url;
      if (typeof sbomUrl !== "string" || sbomUrl.length === 0) {
        return upstream("GitHub generate-report response omitted sbom_url.");
      }
      const sbomUuid = parseSbomUuid(sbomUrl);
      if (!sbomUuid) return upstream("GitHub generate-report sbom_url did not contain a fetch-report uuid.");

      const fetchPath = `${base}/fetch-report/${encodeURIComponent(sbomUuid)}`;
      let downloadUrl: string | undefined;
      for (let attempt = 0; attempt < SBOM_MAX_POLLS; attempt++) {
        const polled = await fetchSbomReport(fetchImpl, options.accessToken, fetchPath);
        if (polled.status === 202 || polled.status === 201) {
          await sleep(SBOM_SLEEP_MS);
          continue;
        }
        if (polled.status === 302 || polled.status === 301 || polled.status === 307 || polled.status === 308) {
          downloadUrl = polled.headers.location ?? polled.headers.Location ?? "";
          if (!downloadUrl) return upstream("GitHub returned a redirect without Location for the SBOM fetch-report.");
          break;
        }
        if (polled.status === 404) return upstream("Dependency graph SBOM not found.");
        return mapRateOrUpstream(polled, "GitHub rejected the dependency graph SBOM fetch-report request.");
      }
      if (!downloadUrl) return upstream("SBOM report not ready within timeout");

      let location: URL;
      try {
        location = new URL(downloadUrl);
      } catch {
        return upstream("GitHub SBOM Location URL is invalid.");
      }
      const allowed = (manifest.network.allowedHosts as string[]) ?? [];
      if (!hostIsAllowed(location.hostname, allowed)) {
        return upstream(`SBOM download host is not allowlisted: ${location.hostname}`);
      }

      const downloaded = await fetchSbomDownload(fetchImpl, options.accessToken, location.toString());
      if (downloaded.status === 200 && isRecord(downloaded.body)) {
        return { ok: true as const, sbom: downloaded.body };
      }
      if (downloaded.status === 404) return upstream("Dependency graph SBOM not found.");
      return mapRateOrUpstream(downloaded, "GitHub rejected the dependency graph SBOM download request.");
    },
    async getCodeqlDatabase(input: unknown) {
      const payload = validateGetCodeqlDatabaseInput(input);
      const path = `${repoPath(payload)}/code-scanning/codeql/databases/${encodeURIComponent(payload.language)}`;
      // Accept application/zip so GitHub answers 302. redirect manual, and the body is never returned.
      const response = await fetchZipRedirect(fetchImpl, options.accessToken, path, "code_scanning.codeql.databases.get");
      if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
        const downloadUrl = response.headers.location ?? response.headers.Location ?? "";
        if (!downloadUrl) return upstream("GitHub returned a redirect without Location for the CodeQL database.");
        return { ok: true as const, downloadUrl };
      }
      if (response.status === 404) return upstream("CodeQL database not found.");
      return mapRateOrUpstream(response, "GitHub rejected the CodeQL database request.");
    },
    async getCodeScanningDefaultSetup(input: unknown) {
      const payload = validateGetCodeScanningDefaultSetupInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/code-scanning/default-setup`);
      return readObject(response, "setup", "Code scanning default setup not found.", "GitHub rejected the code scanning default setup request.");
    },
    async getOrgPropertySchema(input: unknown) {
      const payload = validateGetOrgPropertySchemaInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/properties/schema/${encodeURIComponent(payload.customPropertyName)}`);
      return readObject(response, "property", "Organization property schema not found.", "GitHub rejected the organization property schema request.");
    },
    async getOrgProjectItem(input: unknown) {
      const payload = validateGetOrgProjectItemInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/projectsV2/${payload.projectNumber}/items/${payload.itemId}`);
      return readObject(response, "item", "Organization project item not found.", "GitHub rejected the organization project item request.");
    },
    async getRepoPagesHealth(input: unknown) {
      const payload = validateGetRepoPagesHealthInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/pages/health`);
      return readObject(response, "health", "Pages health not found.", "GitHub rejected the Pages health request.");
    },
    async getRepoPages(input: unknown) {
      const payload = validateGetRepoPagesInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/pages`);
      return readObject(response, "pages", "Pages site not found.", "GitHub rejected the Pages site request.");
    },
    async getUserProjectItem(input: unknown) {
      const payload = validateGetUserProjectItemInput(input);
      const response = await client.fetchJSON(`/users/${encodeURIComponent(payload.username)}/projectsV2/${payload.projectNumber}/items/${payload.itemId}`);
      return readObject(response, "item", "User project item not found.", "GitHub rejected the user project item request.");
    },
    async listRepoIssueTypes(input: unknown) {
      const payload = validateListRepoIssueTypesInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/issue-types${query(payload)}`);
      return readArray(response, "issueTypes", "Issue types not found.", "GitHub rejected the list issue types request.");
    },
    async listOrgProjects(input: unknown) {
      const payload = validateListOrgProjectsInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/projectsV2${query(payload)}`);
      return readArray(response, "projects", "Organization projects not found.", "GitHub rejected the list organization projects request.");
    },
    async listUserProjectItems(input: unknown) {
      const payload = validateListUserProjectItemsInput(input);
      const response = await client.fetchJSON(`/users/${encodeURIComponent(payload.username)}/projectsV2/${payload.projectNumber}/items${query(payload)}`);
      return readArray(response, "items", "User project items not found.", "GitHub rejected the list user project items request.");
    },
    async listUserProjectViewItems(input: unknown) {
      const payload = validateListUserProjectViewItemsInput(input);
      const path = `/users/${encodeURIComponent(payload.username)}/projectsV2/${payload.projectNumber}/views/${payload.viewNumber}/items${query(payload)}`;
      const response = await client.fetchJSON(path);
      return readArray(response, "items", "User project view items not found.", "GitHub rejected the list user project view items request.");
    },
    async listUserProjects(input: unknown) {
      const payload = validateListUserProjectsInput(input);
      const response = await client.fetchJSON(`/users/${encodeURIComponent(payload.username)}/projectsV2${query(payload)}`);
      return readArray(response, "projects", "User projects not found.", "GitHub rejected the list user projects request.");
    },
  };
}


const SBOM_MAX_POLLS = 15;
const SBOM_SLEEP_MS = 2000;

function parseSbomUuid(sbomUrl: string): string | null {
  try {
    const path = sbomUrl.includes("://") ? new URL(sbomUrl).pathname : sbomUrl;
    const marker = "/fetch-report/";
    const idx = path.lastIndexOf(marker);
    if (idx < 0) return null;
    const uuid = path.slice(idx + marker.length).split("/")[0]?.split("?")[0] ?? "";
    return uuid.length > 0 ? uuid : null;
  } catch {
    return null;
  }
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  const parent = executionContext()?.signal;
  await new Promise<void>((resolve, reject) => {
    if (parent?.aborted) {
      reject(parent.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      parent?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(parent?.reason ?? new Error("aborted"));
    };
    parent?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchSbomReport(fetchImpl: typeof fetch, accessToken: string, path: string) {
  // redirect:manual — HTTP boundary would throw OUTBOUND_REDIRECT_BLOCKED on 302.
  return fetchManualJson(fetchImpl, `https://api.github.com${path}`, {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }, "repos.dependency_graph.sbom.get");
}

async function fetchSbomDownload(fetchImpl: typeof fetch, accessToken: string, url: string) {
  const withAuth = await fetchManualJson(fetchImpl, url, {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  }, "repos.dependency_graph.sbom.get");
  if (withAuth.status !== 401) return withAuth;
  return fetchManualJson(fetchImpl, url, {
    Accept: "application/json",
  }, "repos.dependency_graph.sbom.get");
}

async function fetchManualJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  operation: string,
) {
  const spec = (manifest.operations as Record<string, { timeoutMs?: number; maxResponseBytes?: number }>)[operation];
  const timeoutMs = spec?.timeoutMs ?? 60000;
  const maxResponseBytes = spec?.maxResponseBytes ?? 5242880;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parent = executionContext()?.signal;
  const onParentAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
  const outHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    outHeaders[key] = value;
  });
  if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
    return { status: response.status, headers: outHeaders, body: "" as unknown };
  }
  const textBody = await response.text();
  if (textBody.length > maxResponseBytes) return { status: 0, headers: outHeaders, body: "" as unknown };
  let body: unknown = textBody;
  try {
    body = JSON.parse(textBody);
  } catch {
    // keep text
  }
  return { status: response.status, headers: outHeaders, body };
}

async function fetchZipRedirect(fetchImpl: typeof fetch, accessToken: string, path: string, operation: string) {
  const spec = (manifest.operations as Record<string, { timeoutMs?: number; maxResponseBytes?: number }>)[operation];
  const timeoutMs = spec?.timeoutMs ?? 15000;
  const maxResponseBytes = spec?.maxResponseBytes ?? 1048576;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parent = executionContext()?.signal;
  const onParentAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  let response: Response;
  try {
    response = await fetchImpl(`https://api.github.com${path}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/zip",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
    return { status: response.status, headers, body: "" };
  }
  const body = await response.text();
  if (body.length > maxResponseBytes) return { status: 0, headers, body: "" };
  return { status: response.status, headers, body: "" };
}

function readObject(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, missing: string, rejected: string) {
  if (response.status === 200 && isRecord(response.body)) return { ok: true as const, [field]: response.body };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function readArray(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, missing: string, rejected: string) {
  if (response.status === 200 && Array.isArray(response.body)) return { ok: true as const, [field]: response.body };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function emptyInput(input: unknown, action: string): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return {};
}

function repo(input: Record<string, unknown>): Repo {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function projectItem(input: Record<string, unknown>): ProjectItem {
  return {
    projectNumber: requireId(input.projectNumber, "projectNumber"),
    itemId: requireId(input.itemId, "itemId"),
  };
}

function page(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function repoPath(payload: Repo): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`;
}

function query(payload: Page): string {
  const parts: string[] = [];
  if (payload.perPage !== undefined) parts.push(`per_page=${payload.perPage}`);
  if (payload.page !== undefined) parts.push(`page=${payload.page}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return upstream(message);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalPage(value: unknown, field: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
