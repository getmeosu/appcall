import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type ListRepoAlertsInput = {
  owner: string;
  repo: string;
  perPage?: number;
  page?: number;
};

export type GetCodeScanningAlertInput = {
  owner: string;
  repo: string;
  alertNumber: number;
};

export type UpdateCodeScanningAlertInput = GetCodeScanningAlertInput & {
  state: "open" | "dismissed";
  dismissedReason?: string;
  dismissedComment?: string;
};

const DISMISS_REASONS = ["false positive", "won't fix", "used in tests"] as const;

export function validateListDependabotAlertsInput(input: unknown): ListRepoAlertsInput {
  return validateRepoList(input, "dependabot.alerts.list");
}

export function validateListCodeScanningAlertsInput(input: unknown): ListRepoAlertsInput {
  return validateRepoList(input, "code_scanning.alerts.list");
}

export function validateGetCodeScanningAlertInput(input: unknown): GetCodeScanningAlertInput {
  if (!isRecord(input)) throw new Error("code_scanning.alerts.get input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    alertNumber: requireAlertNumber(input.alertNumber),
  };
}

export function validateUpdateCodeScanningAlertInput(input: unknown): UpdateCodeScanningAlertInput {
  if (!isRecord(input)) throw new Error("code_scanning.alerts.update input must be an object");
  const state = input.state;
  if (state !== "open" && state !== "dismissed") throw new Error("state must be open or dismissed");
  const dismissedReason = typeof input.dismissedReason === "string" ? input.dismissedReason : undefined;
  if (dismissedReason !== undefined && !DISMISS_REASONS.includes(dismissedReason as (typeof DISMISS_REASONS)[number])) {
    throw new Error("dismissedReason must be a code scanning dismiss reason");
  }
  return {
    ...validateGetCodeScanningAlertInput(input),
    state,
    dismissedReason,
    dismissedComment: typeof input.dismissedComment === "string" ? input.dismissedComment : undefined,
  };
}

export function validateListSecretScanningAlertsInput(input: unknown): ListRepoAlertsInput {
  return validateRepoList(input, "secret_scanning.alerts.list");
}

export type ListCodeScanningInstancesInput = {
  owner: string;
  repo: string;
  alertNumber: number;
  perPage?: number;
  page?: number;
  ref?: string;
  pr?: number;
};

export function validateListCodeScanningInstancesInput(input: unknown): ListCodeScanningInstancesInput {
  if (!isRecord(input)) throw new Error("code_scanning.alerts.instances.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    alertNumber: requireAlertNumber(input.alertNumber),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
    ref: typeof input.ref === "string" ? input.ref : undefined,
    pr: optionalPage(input.pr, "pr", 1_000_000_000),
  };
}

export type ListCodeScanningAnalysesInput = {
  owner: string;
  repo: string;
  toolName?: string;
  toolGuid?: string;
  perPage?: number;
  page?: number;
  pr?: number;
  ref?: string;
  sarifId?: string;
  direction?: string;
  sort?: string;
};

export function validateListCodeScanningAnalysesInput(input: unknown): ListCodeScanningAnalysesInput {
  if (!isRecord(input)) throw new Error("code_scanning.analyses.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    toolName: typeof input.toolName === "string" ? input.toolName : undefined,
    toolGuid: typeof input.toolGuid === "string" ? input.toolGuid : undefined,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
    pr: optionalPage(input.pr, "pr", 1_000_000_000),
    ref: typeof input.ref === "string" ? input.ref : undefined,
    sarifId: typeof input.sarifId === "string" ? input.sarifId : undefined,
    direction: typeof input.direction === "string" ? input.direction : undefined,
    sort: typeof input.sort === "string" ? input.sort : undefined,
  };
}

export type GetCodeScanningAnalysisInput = { owner: string; repo: string; analysisId: number };

export function validateGetCodeScanningAnalysisInput(input: unknown): GetCodeScanningAnalysisInput {
  if (!isRecord(input)) throw new Error("code_scanning.analyses.get input must be an object");
  const analysisId = input.analysisId;
  if (typeof analysisId !== "number" || !Number.isInteger(analysisId) || analysisId < 1) {
    throw new Error("analysisId must be a positive integer");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    analysisId,
  };
}

export type CodeScanningTool = { name: string; version: string; guid: string };

export type NormalizedCodeScanningInstance = {
  ref: string;
  analysisKey: string;
  environment: string;
  category: string;
  state: string;
  commitSha: string;
  message: string;
  path: string;
  startLine: number;
  endLine: number;
  htmlUrl: string;
};

export function normalizeCodeScanningInstance(item: Record<string, unknown>): NormalizedCodeScanningInstance {
  const message = isRecord(item.message) ? item.message : {};
  const location = isRecord(item.location) ? item.location : {};
  return {
    ref: typeof item.ref === "string" ? item.ref : "",
    analysisKey: typeof item.analysis_key === "string" ? item.analysis_key : "",
    environment: typeof item.environment === "string" ? item.environment : "",
    category: typeof item.category === "string" ? item.category : "",
    state: typeof item.state === "string" ? item.state : "",
    commitSha: typeof item.commit_sha === "string" ? item.commit_sha : "",
    message: typeof message.text === "string" ? message.text : "",
    path: typeof location.path === "string" ? location.path : "",
    startLine: typeof location.start_line === "number" ? location.start_line : 0,
    endLine: typeof location.end_line === "number" ? location.end_line : 0,
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
  };
}

export type NormalizedCodeScanningAnalysis = {
  id: number;
  ref: string;
  commitSha: string;
  analysisKey: string;
  environment: string;
  category: string;
  createdAt: string;
  resultsCount: number;
  rulesCount: number;
  url: string;
  sarifId: string;
  deletable: boolean;
  warning: string;
  tool: CodeScanningTool;
};

export function normalizeCodeScanningAnalysis(item: Record<string, unknown>): NormalizedCodeScanningAnalysis {
  const tool = isRecord(item.tool) ? item.tool : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    ref: typeof item.ref === "string" ? item.ref : "",
    commitSha: typeof item.commit_sha === "string" ? item.commit_sha : "",
    analysisKey: typeof item.analysis_key === "string" ? item.analysis_key : "",
    environment: typeof item.environment === "string" ? item.environment : "",
    category: typeof item.category === "string" ? item.category : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    resultsCount: typeof item.results_count === "number" ? item.results_count : 0,
    rulesCount: typeof item.rules_count === "number" ? item.rules_count : 0,
    url: typeof item.url === "string" ? item.url : "",
    sarifId: typeof item.sarif_id === "string" ? item.sarif_id : "",
    deletable: item.deletable === true,
    warning: typeof item.warning === "string" ? item.warning : "",
    // tool_name on the list response is closing down. Identity is id, not tool_name.
    tool: {
      name: typeof tool.name === "string" ? tool.name : "",
      version: typeof tool.version === "string" ? tool.version : "",
      guid: typeof tool.guid === "string" ? tool.guid : "",
    },
  };
}

export function validateListActionsVariablesInput(input: unknown): ListRepoAlertsInput {
  return validateRepoList(input, "actions.variables.list");
}

export function validateListActionsSecretsInput(input: unknown): ListRepoAlertsInput {
  return validateRepoList(input, "actions.secrets.list");
}

export type NormalizedDependabotAlert = {
  number: number;
  state: string;
  severity: string;
  packageName: string;
  manifestPath: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeDependabotAlert(item: Record<string, unknown>): NormalizedDependabotAlert {
  const dependency = isRecord(item.dependency) ? item.dependency : {};
  const pkg = isRecord(dependency.package) ? dependency.package : {};
  const advisory = isRecord(item.security_advisory) ? item.security_advisory : {};
  return {
    number: typeof item.number === "number" ? item.number : 0,
    state: typeof item.state === "string" ? item.state : "",
    severity: typeof advisory.severity === "string" ? advisory.severity : "",
    packageName: typeof pkg.name === "string" ? pkg.name : "",
    manifestPath: typeof dependency.manifest_path === "string" ? dependency.manifest_path : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type NormalizedCodeScanningAlert = {
  number: number;
  state: string;
  ruleId: string;
  severity: string;
  toolName: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeCodeScanningAlert(item: Record<string, unknown>): NormalizedCodeScanningAlert {
  const rule = isRecord(item.rule) ? item.rule : {};
  const tool = isRecord(item.tool) ? item.tool : {};
  return {
    number: typeof item.number === "number" ? item.number : 0,
    state: typeof item.state === "string" ? item.state : "",
    ruleId: typeof rule.id === "string" ? rule.id : "",
    severity: typeof rule.severity === "string" ? rule.severity : "",
    toolName: typeof tool.name === "string" ? tool.name : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type NormalizedSecretScanningAlert = {
  number: number;
  state: string;
  secretType: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
};

/** Metadata only. Never returns the matched secret or a raw payload. */
export function normalizeSecretScanningAlert(item: Record<string, unknown>): NormalizedSecretScanningAlert {
  return {
    number: typeof item.number === "number" ? item.number : 0,
    state: typeof item.state === "string" ? item.state : "",
    secretType: typeof item.secret_type === "string" ? item.secret_type : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    modelVersion: "2026-05-16",
  };
}

export type NormalizedActionsVariable = {
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedActionsSecret = {
  name: string;
  created_at: string;
  updated_at: string;
};

export function normalizeActionsSecret(item: Record<string, unknown>): NormalizedActionsSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function createAlertsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const forOp = (operation: string) => options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async listDependabotAlerts(input: unknown) {
      const payload = validateListDependabotAlertsInput(input);
      const response = await forOp("dependabot.alerts.list").fetchJSON(`${repoPath(payload.owner, payload.repo)}/dependabot/alerts${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, alerts: response.body.filter(isRecord).map(normalizeDependabotAlert) };
      }
      return mapError(response, "dependabot.alerts.list");
    },

    async listCodeScanningAlerts(input: unknown) {
      const payload = validateListCodeScanningAlertsInput(input);
      const response = await forOp("code_scanning.alerts.list").fetchJSON(`${repoPath(payload.owner, payload.repo)}/code-scanning/alerts${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, alerts: response.body.filter(isRecord).map(normalizeCodeScanningAlert) };
      }
      return mapError(response, "code_scanning.alerts.list");
    },

    async getCodeScanningAlert(input: unknown) {
      const payload = validateGetCodeScanningAlertInput(input);
      const response = await forOp("code_scanning.alerts.get").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/code-scanning/alerts/${payload.alertNumber}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, alert: normalizeCodeScanningAlert(response.body) };
      }
      return mapError(response, "code_scanning.alerts.get");
    },

    async updateCodeScanningAlert(input: unknown) {
      const payload = validateUpdateCodeScanningAlertInput(input);
      const body: Record<string, unknown> = { state: payload.state };
      if (payload.dismissedReason !== undefined) body.dismissed_reason = payload.dismissedReason;
      if (payload.dismissedComment !== undefined) body.dismissed_comment = payload.dismissedComment;
      const response = await forOp("code_scanning.alerts.update").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/code-scanning/alerts/${payload.alertNumber}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, alert: normalizeCodeScanningAlert(response.body) };
      }
      return mapError(response, "code_scanning.alerts.update");
    },

    async listSecretScanningAlerts(input: unknown) {
      const payload = validateListSecretScanningAlertsInput(input);
      const response = await forOp("secret_scanning.alerts.list").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/secret-scanning/alerts${pageQuery(payload)}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, alerts: response.body.filter(isRecord).map(normalizeSecretScanningAlert) };
      }
      return mapError(response, "secret_scanning.alerts.list");
    },

    async listActionsVariables(input: unknown) {
      const payload = validateListActionsVariablesInput(input);
      const response = await forOp("actions.variables.list").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/actions/variables${pageQuery(payload)}`,
      );
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.variables)) {
        const variables = response.body.variables.filter(isRecord).map((item) => ({
          name: typeof item.name === "string" ? item.name : "",
          value: typeof item.value === "string" ? item.value : "",
          createdAt: typeof item.created_at === "string" ? item.created_at : "",
          updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
        }));
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : variables.length,
          variables,
        };
      }
      return mapError(response, "actions.variables.list");
    },

    async listActionsSecrets(input: unknown) {
      const payload = validateListActionsSecretsInput(input);
      const response = await forOp("actions.secrets.list").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/actions/secrets${pageQuery(payload)}`,
      );
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.secrets)) {
        const secrets = response.body.secrets.filter(isRecord).map(normalizeActionsSecret);
        return {
          ok: true as const,
          total_count: typeof response.body.total_count === "number" ? response.body.total_count : secrets.length,
          secrets,
        };
      }
      return mapError(response, "actions.secrets.list");
    },

    async listCodeScanningInstances(input: unknown) {
      const payload = validateListCodeScanningInstancesInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      if (payload.ref) params.set("ref", payload.ref);
      if (payload.pr) params.set("pr", String(payload.pr));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await forOp("code_scanning.alerts.instances.list").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/code-scanning/alerts/${payload.alertNumber}/instances${qs}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, instances: response.body.filter(isRecord).map(normalizeCodeScanningInstance) };
      }
      return mapError(response, "code_scanning.alerts.instances.list");
    },

    async listCodeScanningAnalyses(input: unknown) {
      const payload = validateListCodeScanningAnalysesInput(input);
      const params = new URLSearchParams();
      if (payload.toolName) params.set("tool_name", payload.toolName);
      if (payload.toolGuid) params.set("tool_guid", payload.toolGuid);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      if (payload.pr) params.set("pr", String(payload.pr));
      if (payload.ref) params.set("ref", payload.ref);
      if (payload.sarifId) params.set("sarif_id", payload.sarifId);
      if (payload.direction) params.set("direction", payload.direction);
      if (payload.sort) params.set("sort", payload.sort);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await forOp("code_scanning.analyses.list").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/code-scanning/analyses${qs}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, analyses: response.body.filter(isRecord).map(normalizeCodeScanningAnalysis) };
      }
      return mapError(response, "code_scanning.analyses.list");
    },

    async getCodeScanningAnalysis(input: unknown) {
      const payload = validateGetCodeScanningAnalysisInput(input);
      const response = await forOp("code_scanning.analyses.get").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/code-scanning/analyses/${payload.analysisId}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, analysis: normalizeCodeScanningAnalysis(response.body) };
      }
      return mapError(response, "code_scanning.analyses.get");
    },
  };
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function pageQuery(payload: ListRepoAlertsInput): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function validateRepoList(input: unknown, action: string): ListRepoAlertsInput {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function mapError(response: { status: number; headers: Record<string, string> }, action: string) {
  if (response.status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Not found for ${action}.` } };
  }
  if (response.status === 422) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Validation failed for ${action}.` } };
  }
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub rejected the ${action} request.` } };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireAlertNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("alertNumber must be a positive integer");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
