import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type OrgName = { org: string };
type RepoScope = { owner: string; repo: string };
type OrgVariableRepo = OrgName & { name: string; repositoryId: number };
type RunLogs = RepoScope & { runId: number };
type OrgWorkflowPermissions = OrgName & {
  defaultWorkflowPermissions: "read" | "write";
  canApprovePullRequestReviews: boolean;
};
type OrgActionsPermissions = OrgName & {
  enabledRepositories: "all" | "none" | "selected";
  allowedActions?: "all" | "local_only" | "selected";
  shaPinningRequired?: boolean;
};
type RenderMarkdown = { text: string; mode?: "markdown" | "gfm"; context?: string };
type PagesDeploymentRef = RepoScope & { pagesDeploymentId: string };
type CreatePagesDeployment = RepoScope & {
  pagesBuildVersion: string;
  oidcToken: string;
  artifactId?: number;
  artifactUrl?: string;
  environment?: string;
};
type CreatePagesSite = RepoScope & {
  buildType?: "legacy" | "workflow";
  source?: { branch: string; path: "/" | "/docs" };
};

const ENABLED_REPOSITORIES = ["all", "none", "selected"] as const;
const ALLOWED_ACTIONS = ["all", "local_only", "selected"] as const;
const WORKFLOW_PERMISSIONS = ["read", "write"] as const;
const BUILD_TYPES = ["legacy", "workflow"] as const;
const SOURCE_PATHS = ["/", "/docs"] as const;
const MARKDOWN_MODES = ["markdown", "gfm"] as const;

export function validateAddOrgVariableRepositoryInput(input: unknown): OrgVariableRepo {
  if (!isRecord(input)) throw new Error("actions.org_variables.repositories.add input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    name: requireNonEmptyString(input.name, "name"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateDeleteRunLogsInput(input: unknown): RunLogs {
  if (!isRecord(input)) throw new Error("actions.runs.logs.delete input must be an object");
  return {
    ...repoScope(input),
    runId: requireId(input.runId ?? input.run_id, "runId"),
  };
}

export function validateSetOrgWorkflowPermissionsInput(input: unknown): OrgWorkflowPermissions {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.workflow.set input must be an object");
  const permissions = input.defaultWorkflowPermissions ?? input.default_workflow_permissions;
  if (typeof permissions !== "string" || !WORKFLOW_PERMISSIONS.includes(permissions as (typeof WORKFLOW_PERMISSIONS)[number])) {
    throw new Error("defaultWorkflowPermissions must be read or write");
  }
  const canApprove = input.canApprovePullRequestReviews ?? input.can_approve_pull_request_reviews;
  if (typeof canApprove !== "boolean") {
    throw new Error("canApprovePullRequestReviews must be a boolean");
  }
  return {
    org: requireSingleSegment(input.org, "org"),
    defaultWorkflowPermissions: permissions as "read" | "write",
    canApprovePullRequestReviews: canApprove,
  };
}

export function validateSetOrgActionsPermissionsInput(input: unknown): OrgActionsPermissions {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.set input must be an object");
  const enabled = input.enabledRepositories ?? input.enabled_repositories;
  if (typeof enabled !== "string" || !ENABLED_REPOSITORIES.includes(enabled as (typeof ENABLED_REPOSITORIES)[number])) {
    throw new Error("enabledRepositories must be all, none, or selected");
  }
  const out: OrgActionsPermissions = {
    org: requireSingleSegment(input.org, "org"),
    enabledRepositories: enabled as "all" | "none" | "selected",
  };
  if (input.allowedActions !== undefined || input.allowed_actions !== undefined) {
    const allowed = input.allowedActions ?? input.allowed_actions;
    if (typeof allowed !== "string" || !ALLOWED_ACTIONS.includes(allowed as (typeof ALLOWED_ACTIONS)[number])) {
      throw new Error("allowedActions must be all, local_only, or selected");
    }
    out.allowedActions = allowed as "all" | "local_only" | "selected";
  }
  if (input.shaPinningRequired !== undefined || input.sha_pinning_required !== undefined) {
    const pinned = input.shaPinningRequired ?? input.sha_pinning_required;
    if (typeof pinned !== "boolean") throw new Error("shaPinningRequired must be a boolean");
    out.shaPinningRequired = pinned;
  }
  return out;
}

export function validateRenderMarkdownInput(input: unknown): RenderMarkdown {
  if (!isRecord(input)) throw new Error("markdown.render input must be an object");
  const out: RenderMarkdown = { text: requireNonEmptyString(input.text, "text") };
  if (input.mode !== undefined) {
    if (typeof input.mode !== "string" || !MARKDOWN_MODES.includes(input.mode as (typeof MARKDOWN_MODES)[number])) {
      throw new Error("mode must be markdown or gfm");
    }
    out.mode = input.mode as "markdown" | "gfm";
  }
  if (input.context !== undefined) {
    out.context = requireNonEmptyString(input.context, "context");
  }
  return out;
}

export function validateCancelPagesDeploymentInput(input: unknown): PagesDeploymentRef {
  if (!isRecord(input)) throw new Error("repos.pages.deployments.cancel input must be an object");
  return {
    ...repoScope(input),
    pagesDeploymentId: requireDeploymentId(input.pagesDeploymentId ?? input.pages_deployment_id),
  };
}

export function validateCreatePagesDeploymentInput(input: unknown): CreatePagesDeployment {
  if (!isRecord(input)) throw new Error("repos.pages.deployments.create input must be an object");
  const pagesBuildVersion = requireNonEmptyString(
    input.pagesBuildVersion ?? input.pages_build_version,
    "pagesBuildVersion",
  );
  const oidcToken = requireNonEmptyString(input.oidcToken ?? input.oidc_token, "oidcToken");
  const out: CreatePagesDeployment = {
    ...repoScope(input),
    pagesBuildVersion,
    oidcToken,
  };
  if (input.artifactId !== undefined || input.artifact_id !== undefined) {
    out.artifactId = requireId(input.artifactId ?? input.artifact_id, "artifactId");
  }
  if (input.artifactUrl !== undefined || input.artifact_url !== undefined) {
    out.artifactUrl = requireNonEmptyString(input.artifactUrl ?? input.artifact_url, "artifactUrl");
  }
  if (out.artifactId === undefined && out.artifactUrl === undefined) {
    throw new Error("artifactId or artifactUrl is required");
  }
  if (input.environment !== undefined) {
    out.environment = requireNonEmptyString(input.environment, "environment");
  }
  return out;
}

export function validateCreatePagesSiteInput(input: unknown): CreatePagesSite {
  if (!isRecord(input)) throw new Error("repos.pages.create input must be an object");
  const out: CreatePagesSite = { ...repoScope(input) };
  if (input.buildType !== undefined || input.build_type !== undefined) {
    const buildType = input.buildType ?? input.build_type;
    if (typeof buildType !== "string" || !BUILD_TYPES.includes(buildType as (typeof BUILD_TYPES)[number])) {
      throw new Error("buildType must be legacy or workflow");
    }
    out.buildType = buildType as "legacy" | "workflow";
  }
  if (input.source !== undefined) {
    if (!isRecord(input.source)) throw new Error("source must be an object");
    const branch = requireNonEmptyString(input.source.branch, "source.branch");
    const pathValue = input.source.path === undefined ? "/" : input.source.path;
    if (typeof pathValue !== "string" || !SOURCE_PATHS.includes(pathValue as (typeof SOURCE_PATHS)[number])) {
      throw new Error("source.path must be / or /docs");
    }
    out.source = { branch, path: pathValue as "/" | "/docs" };
  }
  return out;
}

export function validateDeletePagesSiteInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.pages.delete input must be an object");
  return repoScope(input);
}

export function validateRequestPagesBuildInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.pages.builds.request input must be an object");
  return repoScope(input);
}

export function createWriteCard14Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async addOrgVariableRepository(input: unknown) {
      const payload = validateAddOrgVariableRepositoryInput(input);
      const response = await clientFor("actions.org_variables.repositories.add").fetchJSON(
        `/orgs/${seg(payload.org)}/actions/variables/${seg(payload.name)}/repositories/${payload.repositoryId}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { added: true, org: payload.org, name: payload.name, repositoryId: payload.repositoryId },
        "Organization variable repository was not found.",
        "GitHub rejected the add organization variable repository request.",
      );
    },
    async deleteRunLogs(input: unknown) {
      const payload = validateDeleteRunLogsInput(input);
      const response = await clientFor("actions.runs.logs.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/actions/runs/${payload.runId}/logs`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, runId: payload.runId },
        "Workflow run logs were not found.",
        "GitHub rejected the delete workflow run logs request.",
      );
    },
    async setOrgWorkflowPermissions(input: unknown) {
      const payload = validateSetOrgWorkflowPermissionsInput(input);
      const response = await clientFor("orgs.actions.permissions.workflow.set").fetchJSON(
        `/orgs/${seg(payload.org)}/actions/permissions/workflow`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            default_workflow_permissions: payload.defaultWorkflowPermissions,
            can_approve_pull_request_reviews: payload.canApprovePullRequestReviews,
          }),
        },
      );
      if (response.status === 204) {
        return {
          ok: true as const,
          permissions: {
            defaultWorkflowPermissions: payload.defaultWorkflowPermissions,
            canApprovePullRequestReviews: payload.canApprovePullRequestReviews,
          },
        };
      }
      if (response.status === 404) return upstream("Organization workflow permissions were not found.");
      return mapRateOrUpstream(response, "GitHub rejected the set organization workflow permissions request.");
    },
    async setOrgActionsPermissions(input: unknown) {
      const payload = validateSetOrgActionsPermissionsInput(input);
      const body: Record<string, unknown> = { enabled_repositories: payload.enabledRepositories };
      if (payload.allowedActions !== undefined) body.allowed_actions = payload.allowedActions;
      if (payload.shaPinningRequired !== undefined) body.sha_pinning_required = payload.shaPinningRequired;
      const response = await clientFor("orgs.actions.permissions.set").fetchJSON(
        `/orgs/${seg(payload.org)}/actions/permissions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 204) {
        return {
          ok: true as const,
          permissions: {
            enabledRepositories: payload.enabledRepositories,
            allowedActions: payload.allowedActions ?? "",
            shaPinningRequired: payload.shaPinningRequired === true,
          },
        };
      }
      if (response.status === 404) return upstream("Organization Actions permissions were not found.");
      return mapRateOrUpstream(response, "GitHub rejected the set organization Actions permissions request.");
    },
    async renderMarkdown(input: unknown) {
      const payload = validateRenderMarkdownInput(input);
      const body: Record<string, unknown> = { text: payload.text };
      if (payload.mode !== undefined) body.mode = payload.mode;
      if (payload.context !== undefined) body.context = payload.context;
      const response = await clientFor("markdown.render").fetchJSON("/markdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200 && typeof response.body === "string") {
        return { ok: true as const, html: response.body };
      }
      if (response.status === 200 && isRecord(response.body) && typeof response.body.html === "string") {
        return { ok: true as const, html: response.body.html };
      }
      if (response.status === 404) return upstream("Markdown render endpoint was not found.");
      return mapRateOrUpstream(response, "GitHub rejected the markdown render request.");
    },
    async cancelPagesDeployment(input: unknown) {
      const payload = validateCancelPagesDeploymentInput(input);
      const response = await clientFor("repos.pages.deployments.cancel").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pages/deployments/${seg(payload.pagesDeploymentId)}/cancel`,
        { method: "POST" },
      );
      return noContent(
        response,
        204,
        {
          cancelled: true,
          owner: payload.owner,
          repo: payload.repo,
          pagesDeploymentId: payload.pagesDeploymentId,
        },
        "Pages deployment was not found.",
        "GitHub rejected the cancel Pages deployment request.",
      );
    },
    async createPagesDeployment(input: unknown) {
      const payload = validateCreatePagesDeploymentInput(input);
      const body: Record<string, unknown> = {
        pages_build_version: payload.pagesBuildVersion,
        oidc_token: payload.oidcToken,
      };
      if (payload.artifactId !== undefined) body.artifact_id = payload.artifactId;
      if (payload.artifactUrl !== undefined) body.artifact_url = payload.artifactUrl;
      if (payload.environment !== undefined) body.environment = payload.environment;
      const response = await clientFor("repos.pages.deployments.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pages/deployments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return jsonBody(response, [200], "deployment", "Pages deployment was not found.", "GitHub rejected the create Pages deployment request.");
    },
    async createPagesSite(input: unknown) {
      const payload = validateCreatePagesSiteInput(input);
      const body: Record<string, unknown> = {};
      if (payload.buildType !== undefined) body.build_type = payload.buildType;
      if (payload.source !== undefined) body.source = payload.source;
      const response = await clientFor("repos.pages.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return jsonBody(response, [201], "pages", "Pages site was not found.", "GitHub rejected the create Pages site request.");
    },
    async deletePagesSite(input: unknown) {
      const payload = validateDeletePagesSiteInput(input);
      const response = await clientFor("repos.pages.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pages`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo },
        "Pages site was not found.",
        "GitHub rejected the delete Pages site request.",
      );
    },
    async requestPagesBuild(input: unknown) {
      const payload = validateRequestPagesBuildInput(input);
      const response = await clientFor("repos.pages.builds.request").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pages/builds`,
        { method: "POST" },
      );
      return jsonBody(response, [201], "build", "Pages build was not found.", "GitHub rejected the request Pages build request.");
    },
  };
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number[],
  key: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [key]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function repoScope(input: Record<string, unknown>): RepoScope {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function requireDeploymentId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return String(value);
  return requireSingleSegment(value, "pagesDeploymentId");
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
