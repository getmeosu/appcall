import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const PACKAGE_TYPES = new Set(["npm", "maven", "rubygems", "docker", "nuget", "container"]);
const FIELD_DATA_TYPES = new Set(["text", "number", "date", "single_select", "iteration"]);
const ITEM_TYPES = new Set(["Issue", "PullRequest"]);
const VIEW_LAYOUTS = new Set(["table", "board", "roadmap"]);
const SETUP_STATES = new Set(["configured", "not-configured"]);
const RUNNER_TYPES = new Set(["standard", "labeled"]);
const QUERY_SUITES = new Set(["default", "extended"]);
const THREAT_MODELS = new Set(["remote", "remote_and_local"]);
const CODEQL_LANGUAGES = new Set([
  "actions", "c-cpp", "csharp", "go", "java-kotlin", "javascript-typescript", "python", "ruby", "swift",
]);
const CONTENT_TYPES = new Set(["json", "form"]);

type RepoScope = { owner: string; repo: string };
type ProjectScope = { username: string; projectNumber: number };
type UserIdProject = { userId: string; projectNumber: number };

type FieldCreate = ProjectScope & {
  name: string;
  dataType: string;
  singleSelectOptions?: Array<Record<string, unknown>>;
  iterationConfiguration?: Record<string, unknown>;
};

type ItemCreate = ProjectScope & {
  type: string;
  id?: number;
  owner?: string;
  repo?: string;
  number?: number;
};

type DraftCreate = UserIdProject & { title: string; body?: string };

type ViewCreate = ProjectScope & {
  name: string;
  layout: string;
  filter?: string;
  visibleFields?: number[];
  sortBy?: unknown[];
  groupBy?: number[];
  verticalGroupBy?: number[];
};

type AutolinkDelete = RepoScope & { autolinkId: number };
type AnalysisDelete = RepoScope & { analysisId: number; confirmDelete?: string };
type PackageDelete = { username: string; packageType: string; packageName: string };
type RunnerLabelRemove = RepoScope & { runnerId: number; name: string };
type HookTest = RepoScope & { hookId: number };

type DefaultSetupUpdate = RepoScope & {
  state?: string;
  runnerType?: string;
  runnerLabel?: string;
  querySuite?: string;
  threatModel?: string;
  languages?: string[];
};

type HookConfigUpdate = {
  url?: string;
  contentType?: string;
  secret?: string;
  insecureSsl?: boolean;
};

type OrgHookConfigUpdate = HookConfigUpdate & { org: string; hookId: number };
type RepoHookConfigUpdate = HookConfigUpdate & RepoScope & { hookId: number };

type ItemUpdate = ProjectScope & {
  itemId: number;
  fields: Array<{ id: number; value: string | number | null }>;
};

export function validateCreateUserProjectFieldInput(input: unknown): FieldCreate {
  if (!isRecord(input)) throw new Error("users.projects_v2.fields.create input must be an object");
  const dataType = requireNonEmpty(input.dataType ?? input.data_type, "dataType");
  if (!FIELD_DATA_TYPES.has(dataType)) throw new Error("dataType must be a GitHub projects field data type");
  const out: FieldCreate = {
    ...projectScope(input),
    name: requireNonEmpty(input.name, "name"),
    dataType,
  };
  if (input.singleSelectOptions !== undefined || input.single_select_options !== undefined) {
    const raw = input.singleSelectOptions ?? input.single_select_options;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("singleSelectOptions must be a non-empty array");
    out.singleSelectOptions = raw.map((item, index) => {
      if (!isRecord(item)) throw new Error(`singleSelectOptions[${index}] must be an object`);
      return item;
    });
  }
  if (input.iterationConfiguration !== undefined || input.iteration_configuration !== undefined) {
    const raw = input.iterationConfiguration ?? input.iteration_configuration;
    if (!isRecord(raw)) throw new Error("iterationConfiguration must be an object");
    out.iterationConfiguration = raw;
  }
  if (dataType === "single_select" && !out.singleSelectOptions) {
    throw new Error("singleSelectOptions is required for single_select fields");
  }
  if (dataType === "iteration" && !out.iterationConfiguration) {
    throw new Error("iterationConfiguration is required for iteration fields");
  }
  return out;
}

export function validateCreateUserProjectItemInput(input: unknown): ItemCreate {
  if (!isRecord(input)) throw new Error("users.projects_v2.items.create input must be an object");
  const type = requireNonEmpty(input.type, "type");
  if (!ITEM_TYPES.has(type)) throw new Error("type must be Issue or PullRequest");
  const out: ItemCreate = { ...projectScope(input), type };
  if (input.id !== undefined) out.id = requireId(input.id, "id");
  if (input.owner !== undefined) out.owner = requireSingleSegment(input.owner, "owner");
  if (input.repo !== undefined) out.repo = requireSingleSegment(input.repo, "repo");
  if (input.number !== undefined) out.number = requireId(input.number, "number");
  const hasId = out.id !== undefined;
  const hasCoords = out.owner !== undefined && out.repo !== undefined && out.number !== undefined;
  if (!hasId && !hasCoords) {
    throw new Error("id or owner+repo+number is required");
  }
  return out;
}

export function validateCreateUserProjectDraftInput(input: unknown): DraftCreate {
  if (!isRecord(input)) throw new Error("users.projects_v2.drafts.create input must be an object");
  const out: DraftCreate = {
    userId: requireSingleSegment(input.userId ?? input.user_id, "userId"),
    projectNumber: requireId(input.projectNumber ?? input.project_number, "projectNumber"),
    title: requireNonEmpty(input.title, "title"),
  };
  if (input.body !== undefined) out.body = requireNonEmpty(input.body, "body");
  return out;
}

export function validateCreateUserProjectViewInput(input: unknown): ViewCreate {
  if (!isRecord(input)) throw new Error("users.projects_v2.views.create input must be an object");
  const layout = requireNonEmpty(input.layout, "layout");
  if (!VIEW_LAYOUTS.has(layout)) throw new Error("layout must be table, board, or roadmap");
  const out: ViewCreate = {
    ...projectScope(input),
    name: requireNonEmpty(input.name, "name"),
    layout,
  };
  if (input.filter !== undefined) out.filter = requireNonEmpty(input.filter, "filter");
  if (input.visibleFields !== undefined || input.visible_fields !== undefined) {
    out.visibleFields = requireIdList(input.visibleFields ?? input.visible_fields, "visibleFields");
  }
  if (input.sortBy !== undefined || input.sort_by !== undefined) {
    const raw = input.sortBy ?? input.sort_by;
    if (!Array.isArray(raw)) throw new Error("sortBy must be an array");
    out.sortBy = raw;
  }
  if (input.groupBy !== undefined || input.group_by !== undefined) {
    out.groupBy = requireIdList(input.groupBy ?? input.group_by, "groupBy");
  }
  if (input.verticalGroupBy !== undefined || input.vertical_group_by !== undefined) {
    out.verticalGroupBy = requireIdList(input.verticalGroupBy ?? input.vertical_group_by, "verticalGroupBy");
  }
  return out;
}

export function validateDeleteAutolinkInput(input: unknown): AutolinkDelete {
  if (!isRecord(input)) throw new Error("repos.autolinks.delete input must be an object");
  return {
    ...repoScope(input),
    autolinkId: requireId(input.autolink_id ?? input.autolinkId, "autolink_id"),
  };
}

export function validateDeleteCodeScanningAnalysisInput(input: unknown): AnalysisDelete {
  if (!isRecord(input)) throw new Error("code_scanning.analyses.delete input must be an object");
  const out: AnalysisDelete = {
    ...repoScope(input),
    analysisId: requireId(input.analysisId ?? input.analysis_id, "analysisId"),
  };
  if (input.confirmDelete !== undefined || input.confirm_delete !== undefined) {
    const value = input.confirmDelete ?? input.confirm_delete;
    if (typeof value !== "string") throw new Error("confirmDelete must be a string");
    out.confirmDelete = value;
  }
  return out;
}

export function validateDeleteUserPackageInput(input: unknown): PackageDelete {
  if (!isRecord(input)) throw new Error("users.packages.delete input must be an object");
  return {
    username: requireSingleSegment(input.username, "username"),
    ...packageRef(input),
  };
}

export function validateRemoveRunnerLabelInput(input: unknown): RunnerLabelRemove {
  if (!isRecord(input)) throw new Error("repos.actions.runners.labels.remove input must be an object");
  return {
    ...repoScope(input),
    runnerId: requireId(input.runnerId ?? input.runner_id, "runnerId"),
    name: requireNonEmpty(input.name, "name"),
  };
}

export function validateTestRepoHookInput(input: unknown): HookTest {
  if (!isRecord(input)) throw new Error("repos.hooks.test input must be an object");
  return {
    ...repoScope(input),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
  };
}

export function validateUpdateCodeScanningDefaultSetupInput(input: unknown): DefaultSetupUpdate {
  if (!isRecord(input)) throw new Error("code_scanning.default_setup.update input must be an object");
  const out: DefaultSetupUpdate = { ...repoScope(input) };
  if (input.state !== undefined) {
    const state = requireNonEmpty(input.state, "state");
    if (!SETUP_STATES.has(state)) throw new Error("state must be configured or not-configured");
    out.state = state;
  }
  if (input.runnerType !== undefined || input.runner_type !== undefined) {
    const runnerType = requireNonEmpty(input.runnerType ?? input.runner_type, "runnerType");
    if (!RUNNER_TYPES.has(runnerType)) throw new Error("runnerType must be standard or labeled");
    out.runnerType = runnerType;
  }
  if (input.runnerLabel !== undefined || input.runner_label !== undefined) {
    out.runnerLabel = requireNonEmpty(input.runnerLabel ?? input.runner_label, "runnerLabel");
  }
  if (input.querySuite !== undefined || input.query_suite !== undefined) {
    const querySuite = requireNonEmpty(input.querySuite ?? input.query_suite, "querySuite");
    if (!QUERY_SUITES.has(querySuite)) throw new Error("querySuite must be default or extended");
    out.querySuite = querySuite;
  }
  if (input.threatModel !== undefined || input.threat_model !== undefined) {
    const threatModel = requireNonEmpty(input.threatModel ?? input.threat_model, "threatModel");
    if (!THREAT_MODELS.has(threatModel)) throw new Error("threatModel must be remote or remote_and_local");
    out.threatModel = threatModel;
  }
  if (input.languages !== undefined) {
    if (!Array.isArray(input.languages)) throw new Error("languages must be an array");
    out.languages = input.languages.map((item, index) => {
      if (typeof item !== "string" || item.length === 0) throw new Error(`languages[${index}] must be a non-empty string`);
      if (!CODEQL_LANGUAGES.has(item)) throw new Error(`languages[${index}] must be a CodeQL language`);
      return item;
    });
  }
  return out;
}

export function validateUpdateOrgHookConfigInput(input: unknown): OrgHookConfigUpdate {
  if (!isRecord(input)) throw new Error("orgs.hooks.config.update input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
    ...hookConfig(input),
  };
}

export function validateUpdateRepoHookConfigInput(input: unknown): RepoHookConfigUpdate {
  if (!isRecord(input)) throw new Error("repos.hooks.config.update input must be an object");
  return {
    ...repoScope(input),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
    ...hookConfig(input),
  };
}

export function validateUpdateUserProjectItemInput(input: unknown): ItemUpdate {
  if (!isRecord(input)) throw new Error("users.projects_v2.items.update input must be an object");
  if (!Array.isArray(input.fields) || input.fields.length === 0) throw new Error("fields is required");
  return {
    ...projectScope(input),
    itemId: requireId(input.itemId ?? input.item_id, "itemId"),
    fields: input.fields.map((item, index) => {
      if (!isRecord(item)) throw new Error(`fields[${index}] must be an object`);
      const id = requireId(item.id, `fields[${index}].id`);
      if (item.value === null) return { id, value: null };
      if (typeof item.value === "string" || typeof item.value === "number") return { id, value: item.value };
      throw new Error(`fields[${index}].value must be a string, number, or null`);
    }),
  };
}

export function createWriteCard17Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async createUserProjectField(input: unknown) {
      const payload = validateCreateUserProjectFieldInput(input);
      const body: Record<string, unknown> = { name: payload.name, data_type: payload.dataType };
      if (payload.singleSelectOptions !== undefined) body.single_select_options = payload.singleSelectOptions;
      if (payload.iterationConfiguration !== undefined) body.iteration_configuration = payload.iterationConfiguration;
      const response = await clientFor("users.projects_v2.fields.create").fetchJSON(
        `/users/${seg(payload.username)}/projectsV2/${payload.projectNumber}/fields`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      return jsonBody(response, [201], "field", "User project was not found.", "GitHub rejected the create user project field request.");
    },

    async createUserProjectItem(input: unknown) {
      const payload = validateCreateUserProjectItemInput(input);
      const body: Record<string, unknown> = { type: payload.type };
      if (payload.id !== undefined) body.id = payload.id;
      if (payload.owner !== undefined) body.owner = payload.owner;
      if (payload.repo !== undefined) body.repo = payload.repo;
      if (payload.number !== undefined) body.number = payload.number;
      const response = await clientFor("users.projects_v2.items.create").fetchJSON(
        `/users/${seg(payload.username)}/projectsV2/${payload.projectNumber}/items`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      return jsonBody(response, [201], "item", "User project was not found.", "GitHub rejected the create user project item request.");
    },

    async createUserProjectDraft(input: unknown) {
      const payload = validateCreateUserProjectDraftInput(input);
      const body: Record<string, unknown> = { title: payload.title };
      if (payload.body !== undefined) body.body = payload.body;
      const response = await clientFor("users.projects_v2.drafts.create").fetchJSON(
        `/user/${seg(payload.userId)}/projectsV2/${payload.projectNumber}/drafts`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      return jsonBody(response, [201], "draft", "User project was not found.", "GitHub rejected the create user project draft request.");
    },

    async createUserProjectView(input: unknown) {
      const payload = validateCreateUserProjectViewInput(input);
      const body: Record<string, unknown> = { name: payload.name, layout: payload.layout };
      if (payload.filter !== undefined) body.filter = payload.filter;
      if (payload.visibleFields !== undefined) body.visible_fields = payload.visibleFields;
      if (payload.sortBy !== undefined) body.sort_by = payload.sortBy;
      if (payload.groupBy !== undefined) body.group_by = payload.groupBy;
      if (payload.verticalGroupBy !== undefined) body.vertical_group_by = payload.verticalGroupBy;
      const response = await clientFor("users.projects_v2.views.create").fetchJSON(
        `/users/${seg(payload.username)}/projectsV2/${payload.projectNumber}/views`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      return jsonBody(response, [201], "view", "User project was not found.", "GitHub rejected the create user project view request.");
    },

    async deleteAutolink(input: unknown) {
      const payload = validateDeleteAutolinkInput(input);
      const response = await clientFor("repos.autolinks.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/autolinks/${payload.autolinkId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, autolinkId: payload.autolinkId },
        "Autolink was not found.",
        "GitHub rejected the delete autolink request.",
      );
    },

    async deleteCodeScanningAnalysis(input: unknown) {
      const payload = validateDeleteCodeScanningAnalysisInput(input);
      const params = new URLSearchParams();
      if (payload.confirmDelete !== undefined) params.set("confirm_delete", payload.confirmDelete);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await clientFor("code_scanning.analyses.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/code-scanning/analyses/${payload.analysisId}${qs}`,
        { method: "DELETE" },
      );
      return jsonBody(response, [200], "deletion", "Code scanning analysis was not found.", "GitHub rejected the delete code scanning analysis request.");
    },

    async deleteUserPackage(input: unknown) {
      const payload = validateDeleteUserPackageInput(input);
      const response = await clientFor("users.packages.delete").fetchJSON(
        `/users/${seg(payload.username)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          deleted: true,
          username: payload.username,
          packageType: payload.packageType,
          packageName: payload.packageName,
        },
        "User package was not found.",
        "GitHub rejected the delete user package request.",
      );
    },

    async removeRunnerLabel(input: unknown) {
      const payload = validateRemoveRunnerLabelInput(input);
      const response = await clientFor("repos.actions.runners.labels.remove").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/actions/runners/${payload.runnerId}/labels/${seg(payload.name)}`,
        { method: "DELETE" },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : 0,
          labels: Array.isArray(response.body.labels) ? response.body.labels : [],
        };
      }
      if (response.status === 404) return upstream("Runner label was not found.");
      return mapRateOrUpstream(response, "GitHub rejected the remove runner label request.");
    },

    async testRepoHook(input: unknown) {
      const payload = validateTestRepoHookInput(input);
      const response = await clientFor("repos.hooks.test").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/hooks/${payload.hookId}/tests`,
        { method: "POST" },
      );
      return noContent(
        response,
        204,
        { tested: true, owner: payload.owner, repo: payload.repo, hookId: payload.hookId },
        "Repository webhook was not found.",
        "GitHub rejected the test repository webhook request.",
      );
    },

    async updateCodeScanningDefaultSetup(input: unknown) {
      const payload = validateUpdateCodeScanningDefaultSetupInput(input);
      const body: Record<string, unknown> = {};
      if (payload.state !== undefined) body.state = payload.state;
      if (payload.runnerType !== undefined) body.runner_type = payload.runnerType;
      if (payload.runnerLabel !== undefined) body.runner_label = payload.runnerLabel;
      if (payload.querySuite !== undefined) body.query_suite = payload.querySuite;
      if (payload.threatModel !== undefined) body.threat_model = payload.threatModel;
      if (payload.languages !== undefined) body.languages = payload.languages;
      const response = await clientFor("code_scanning.default_setup.update").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/code-scanning/default-setup`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if ((response.status === 200 || response.status === 202) && (response.body === null || isRecord(response.body))) {
        return { ok: true as const, setup: isRecord(response.body) ? response.body : {} };
      }
      if (response.status === 404) return upstream("Code scanning default setup was not found.");
      return mapRateOrUpstream(response, "GitHub rejected the update code scanning default setup request.");
    },

    async updateOrgHookConfig(input: unknown) {
      const payload = validateUpdateOrgHookConfigInput(input);
      const response = await clientFor("orgs.hooks.config.update").fetchJSON(
        `/orgs/${seg(payload.org)}/hooks/${payload.hookId}/config`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hookConfigBody(payload)),
        },
      );
      return jsonBody(response, [200], "config", "Organization webhook was not found.", "GitHub rejected the update organization webhook config request.");
    },

    async updateRepoHookConfig(input: unknown) {
      const payload = validateUpdateRepoHookConfigInput(input);
      const response = await clientFor("repos.hooks.config.update").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/hooks/${payload.hookId}/config`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hookConfigBody(payload)),
        },
      );
      return jsonBody(response, [200], "config", "Repository webhook was not found.", "GitHub rejected the update repository webhook config request.");
    },

    async updateUserProjectItem(input: unknown) {
      const payload = validateUpdateUserProjectItemInput(input);
      const response = await clientFor("users.projects_v2.items.update").fetchJSON(
        `/users/${seg(payload.username)}/projectsV2/${payload.projectNumber}/items/${payload.itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: payload.fields }),
        },
      );
      return jsonBody(response, [200], "item", "User project item was not found.", "GitHub rejected the update user project item request.");
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

function hookConfig(input: Record<string, unknown>): HookConfigUpdate {
  const contentType = optionalString(input.contentType ?? input.content_type, "contentType");
  if (contentType !== undefined && !CONTENT_TYPES.has(contentType)) {
    throw new Error("contentType must be json or form");
  }
  return {
    url: optionalString(input.url, "url"),
    contentType,
    secret: optionalString(input.secret, "secret"),
    insecureSsl: optionalBoolean(input.insecureSsl ?? input.insecure_ssl, "insecureSsl"),
  };
}

function hookConfigBody(payload: HookConfigUpdate): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.url !== undefined) body.url = payload.url;
  if (payload.contentType !== undefined) body.content_type = payload.contentType;
  if (payload.secret !== undefined) body.secret = payload.secret;
  if (payload.insecureSsl !== undefined) body.insecure_ssl = payload.insecureSsl ? "1" : "0";
  return body;
}

function packageRef(input: Record<string, unknown>): { packageType: string; packageName: string } {
  const packageType = requireNonEmpty(input.packageType ?? input.package_type, "packageType");
  if (!PACKAGE_TYPES.has(packageType)) throw new Error("packageType must be a GitHub package type");
  const packageName = input.packageName ?? input.package_name;
  if (typeof packageName !== "string" || packageName.length === 0) throw new Error("packageName is required");
  if (packageName.includes("?") || packageName.includes("#")) {
    throw new Error("packageName must not include a query or fragment");
  }
  return { packageType, packageName };
}

function projectScope(input: Record<string, unknown>): ProjectScope {
  return {
    username: requireSingleSegment(input.username, "username"),
    projectNumber: requireId(input.projectNumber ?? input.project_number, "projectNumber"),
  };
}

function repoScope(input: Record<string, unknown>): RepoScope {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function requireIdList(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => requireId(item, `${field}[${index}]`));
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

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
