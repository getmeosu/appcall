import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const DEPLOYMENT_STATES = ["error", "failure", "inactive", "in_progress", "queued", "pending", "success"] as const;

export type GitHubDeployment = {
  id: number;
  sha?: string;
  ref?: string;
  task?: string;
  environment?: string;
  original_environment?: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  transient_environment?: boolean;
  production_environment?: boolean;
  creator?: { login?: string };
  [key: string]: unknown;
};

export type NormalizedDeployment = {
  id: string;
  provider: "github";
  providerDeploymentId: number;
  sha: string;
  ref: string;
  task: string;
  environment: string;
  description: string;
  creator: string;
  transientEnvironment: boolean;
  productionEnvironment: boolean;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubDeployment;
};

export function normalizeGitHubDeployment(item: GitHubDeployment): NormalizedDeployment {
  return {
    id: `gh-deployment:${item.id}`,
    provider: "github",
    providerDeploymentId: item.id,
    sha: item.sha ?? "",
    ref: item.ref ?? "",
    task: item.task ?? "",
    environment: item.environment ?? "",
    description: typeof item.description === "string" ? item.description : "",
    creator: item.creator?.login ?? "",
    transientEnvironment: item.transient_environment ?? false,
    productionEnvironment: item.production_environment ?? false,
    createdAt: item.created_at ?? "",
    updatedAt: item.updated_at ?? "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type GitHubDeploymentStatus = {
  id: number;
  state?: string;
  description?: string | null;
  environment?: string;
  target_url?: string;
  log_url?: string;
  environment_url?: string;
  created_at?: string;
  updated_at?: string;
  creator?: { login?: string };
  [key: string]: unknown;
};

export type NormalizedDeploymentStatus = {
  id: string;
  provider: "github";
  providerStatusId: number;
  state: string;
  description: string;
  environment: string;
  logUrl: string;
  environmentUrl: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubDeploymentStatus;
};

export function normalizeGitHubDeploymentStatus(item: GitHubDeploymentStatus): NormalizedDeploymentStatus {
  return {
    id: `gh-deployment-status:${item.id}`,
    provider: "github",
    providerStatusId: item.id,
    state: item.state ?? "",
    description: typeof item.description === "string" ? item.description : "",
    environment: item.environment ?? "",
    logUrl: item.log_url ?? item.target_url ?? "",
    environmentUrl: item.environment_url ?? "",
    creator: item.creator?.login ?? "",
    createdAt: item.created_at ?? "",
    updatedAt: item.updated_at ?? "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type GitHubEnvironment = {
  id?: number;
  name?: string;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type NormalizedEnvironment = {
  id: string;
  provider: "github";
  providerEnvironmentId: number;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubEnvironment;
};

export function normalizeGitHubEnvironment(item: GitHubEnvironment): NormalizedEnvironment {
  const name = item.name ?? "";
  const providerId = typeof item.id === "number" ? item.id : 0;
  return {
    id: providerId > 0 ? `gh-environment:${providerId}` : `gh-environment:${name}`,
    provider: "github",
    providerEnvironmentId: providerId,
    name,
    url: item.html_url ?? "",
    createdAt: item.created_at ?? "",
    updatedAt: item.updated_at ?? "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type ListDeploymentsInput = {
  owner: string;
  repo: string;
  sha?: string;
  ref?: string;
  task?: string;
  environment?: string;
  perPage?: number;
  page?: number;
};

export function validateListDeploymentsInput(input: unknown): ListDeploymentsInput {
  if (!isRecord(input)) throw new Error("deployments.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    sha: optionalString(input.sha, "sha"),
    ref: optionalString(input.ref, "ref"),
    task: optionalString(input.task, "task"),
    environment: optionalString(input.environment, "environment"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetDeploymentInput = {
  owner: string;
  repo: string;
  deploymentId?: number;
  ref?: string;
  environment?: string;
};

export function validateGetDeploymentInput(input: unknown): GetDeploymentInput {
  if (!isRecord(input)) throw new Error("deployments.get input must be an object");
  const deploymentId = optionalId(input.deploymentId, "deploymentId") ?? optionalId(input.id, "id");
  const ref = optionalString(input.ref, "ref");
  if (deploymentId === undefined && !ref) throw new Error("deploymentId or ref is required");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    deploymentId,
    ref,
    environment: optionalString(input.environment, "environment"),
  };
}

export type CreateDeploymentInput = {
  owner: string;
  repo: string;
  ref: string;
  task?: string;
  autoMerge?: boolean;
  requiredContexts?: string[];
  payload?: Record<string, unknown> | string;
  environment?: string;
  description?: string;
  transientEnvironment?: boolean;
  productionEnvironment?: boolean;
};

export function validateCreateDeploymentInput(input: unknown): CreateDeploymentInput {
  if (!isRecord(input)) throw new Error("deployments.create input must be an object");
  let requiredContexts: string[] | undefined;
  if (input.requiredContexts !== undefined) {
    if (!Array.isArray(input.requiredContexts) || input.requiredContexts.some((v) => typeof v !== "string")) {
      throw new Error("requiredContexts must be an array of strings");
    }
    requiredContexts = input.requiredContexts;
  }
  let payload: Record<string, unknown> | string | undefined;
  if (input.payload !== undefined) {
    if (typeof input.payload === "string") payload = input.payload;
    else if (isRecord(input.payload)) payload = input.payload;
    else throw new Error("payload must be an object or string");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
    task: optionalString(input.task, "task"),
    autoMerge: optionalBoolean(input.autoMerge, "autoMerge"),
    requiredContexts,
    payload,
    environment: optionalString(input.environment, "environment"),
    description: optionalString(input.description, "description"),
    transientEnvironment: optionalBoolean(input.transientEnvironment, "transientEnvironment"),
    productionEnvironment: optionalBoolean(input.productionEnvironment, "productionEnvironment"),
  };
}

export type ListDeploymentStatusesInput = {
  owner: string;
  repo: string;
  deploymentId: number;
  perPage?: number;
  page?: number;
};

export function validateListDeploymentStatusesInput(input: unknown): ListDeploymentStatusesInput {
  if (!isRecord(input)) throw new Error("deployments.statuses.list input must be an object");
  const deploymentId = optionalId(input.deploymentId, "deploymentId");
  if (deploymentId === undefined) throw new Error("deploymentId is required");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    deploymentId,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type CreateDeploymentStatusInput = {
  owner: string;
  repo: string;
  deploymentId: number;
  state: (typeof DEPLOYMENT_STATES)[number];
  description?: string;
  environment?: string;
  logUrl?: string;
  environmentUrl?: string;
  autoInactive?: boolean;
};

export function validateCreateDeploymentStatusInput(input: unknown): CreateDeploymentStatusInput {
  if (!isRecord(input)) throw new Error("deployments.statuses.create input must be an object");
  const deploymentId = optionalId(input.deploymentId, "deploymentId");
  if (deploymentId === undefined) throw new Error("deploymentId is required");
  const state = requireString(input.state, "state");
  if (!DEPLOYMENT_STATES.includes(state as (typeof DEPLOYMENT_STATES)[number])) {
    throw new Error("state must be one of error, failure, inactive, in_progress, queued, pending, success");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    deploymentId,
    state: state as (typeof DEPLOYMENT_STATES)[number],
    description: optionalString(input.description, "description"),
    environment: optionalString(input.environment, "environment"),
    logUrl: optionalHttpUrl(input.logUrl, "logUrl"),
    environmentUrl: optionalHttpUrl(input.environmentUrl, "environmentUrl"),
    autoInactive: optionalBoolean(input.autoInactive, "autoInactive"),
  };
}

export type ListEnvironmentsInput = { owner: string; repo: string; perPage?: number; page?: number };

export function validateListEnvironmentsInput(input: unknown): ListEnvironmentsInput {
  if (!isRecord(input)) throw new Error("environments.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetEnvironmentInput = { owner: string; repo: string; name: string };

export function validateGetEnvironmentInput(input: unknown): GetEnvironmentInput {
  if (!isRecord(input)) throw new Error("environments.get input must be an object");
  const name = optionalString(input.name, "name") ?? optionalString(input.environment, "environment");
  if (!name) throw new Error("name is required");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name,
  };
}

function mapError(status: number, headers: Record<string, string>, action: string) {
  if (status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Not found for ${action}.` } };
  }
  if (status === 422) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Validation failed for ${action}.` } };
  }
  if (status === 409) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Conflict for ${action}.` } };
  }
  if (status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited)) {
    const rateLimit = parseGitHubRateLimit(status, headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub rejected the ${action} request.` } };
}


export type CreateEnvironmentInput = {
  owner: string;
  repo: string;
  name: string;
  waitTimer?: number;
  preventSelfReview?: boolean;
  reviewers?: { type: "User" | "Team"; id: number }[];
  deploymentBranchPolicy?: { protectedBranches: boolean; customBranchPolicies: boolean } | null;
};

export function validateCreateEnvironmentInput(input: unknown): CreateEnvironmentInput {
  if (!isRecord(input)) throw new Error("environments.create input must be an object");
  let reviewers: { type: "User" | "Team"; id: number }[] | undefined;
  if (input.reviewers !== undefined) {
    if (!Array.isArray(input.reviewers)) throw new Error("reviewers must be an array");
    reviewers = input.reviewers.map((reviewer) => {
      if (!isRecord(reviewer)) throw new Error("reviewers must be objects");
      if (reviewer.type !== "User" && reviewer.type !== "Team") throw new Error("reviewer type must be User or Team");
      return { type: reviewer.type, id: requireSafeId(reviewer.id, "reviewers.id") };
    });
  }
  let deploymentBranchPolicy: CreateEnvironmentInput["deploymentBranchPolicy"];
  if (input.deploymentBranchPolicy === null) deploymentBranchPolicy = null;
  else if (input.deploymentBranchPolicy !== undefined) {
    if (!isRecord(input.deploymentBranchPolicy)) throw new Error("deploymentBranchPolicy must be an object or null");
    if (typeof input.deploymentBranchPolicy.protectedBranches !== "boolean" || typeof input.deploymentBranchPolicy.customBranchPolicies !== "boolean") {
      throw new Error("deploymentBranchPolicy flags must be booleans");
    }
    deploymentBranchPolicy = {
      protectedBranches: input.deploymentBranchPolicy.protectedBranches,
      customBranchPolicies: input.deploymentBranchPolicy.customBranchPolicies,
    };
  }
  const waitTimer = input.waitTimer === undefined ? undefined : requireWaitTimer(input.waitTimer);
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name: requireString(input.name, "name"),
    waitTimer,
    preventSelfReview: optionalBoolean(input.preventSelfReview, "preventSelfReview"),
    reviewers,
    deploymentBranchPolicy,
  };
}

export type DeleteDeploymentInput = { owner: string; repo: string; deploymentId: number };
export function validateDeleteDeploymentInput(input: unknown): DeleteDeploymentInput {
  if (!isRecord(input)) throw new Error("deployments.delete input must be an object");
  const deploymentId = optionalId(input.deploymentId, "deploymentId");
  if (deploymentId === undefined) throw new Error("deploymentId is required");
  return { owner: requireString(input.owner, "owner"), repo: requireString(input.repo, "repo"), deploymentId };
}

export type DeleteEnvironmentInput = { owner: string; repo: string; name: string };
export function validateDeleteEnvironmentInput(input: unknown): DeleteEnvironmentInput {
  if (!isRecord(input)) throw new Error("environments.delete input must be an object");
  const name = optionalString(input.name, "name") ?? optionalString(input.environment, "environment");
  if (!name) throw new Error("name is required");
  return { owner: requireString(input.owner, "owner"), repo: requireString(input.repo, "repo"), name };
}

function requireSafeId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
  return value;
}

function requireWaitTimer(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 43200) {
    throw new Error("waitTimer must be an integer between 0 and 43200");
  }
  return value;
}

export function createDeploymentsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async list(input: unknown) {
      const payload = validateListDeploymentsInput(input);
      const params = new URLSearchParams();
      if (payload.sha) params.set("sha", payload.sha);
      if (payload.ref) params.set("ref", payload.ref);
      if (payload.task) params.set("task", payload.task);
      if (payload.environment) params.set("environment", payload.environment);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await clientFor("deployments.list").fetchJSON(`/repos/${payload.owner}/${payload.repo}/deployments${qs}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, deployments: (response.body as GitHubDeployment[]).map(normalizeGitHubDeployment) };
      }
      return mapError(response.status, response.headers, "deployments.list");
    },

    async get(input: unknown) {
      const payload = validateGetDeploymentInput(input);
      const client = clientFor("deployments.get");
      if (payload.deploymentId !== undefined) {
        const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/deployments/${payload.deploymentId}`);
        if (response.status === 200 && isRecord(response.body)) {
          return { ok: true as const, deployment: normalizeGitHubDeployment(response.body as GitHubDeployment) };
        }
        return mapError(response.status, response.headers, "deployments.get");
      }
      const params = new URLSearchParams();
      if (payload.ref) params.set("ref", payload.ref);
      if (payload.environment) params.set("environment", payload.environment);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/deployments?${params.toString()}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        const first = (response.body as GitHubDeployment[])[0];
        if (!first || typeof first.id !== "number") {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Not found for deployments.get." } };
        }
        return { ok: true as const, deployment: normalizeGitHubDeployment(first) };
      }
      return mapError(response.status, response.headers, "deployments.get");
    },

    async create(input: unknown) {
      const payload = validateCreateDeploymentInput(input);
      const body: Record<string, unknown> = { ref: payload.ref };
      if (payload.task !== undefined) body.task = payload.task;
      if (payload.autoMerge !== undefined) body.auto_merge = payload.autoMerge;
      if (payload.requiredContexts !== undefined) body.required_contexts = payload.requiredContexts;
      if (payload.payload !== undefined) body.payload = payload.payload;
      if (payload.environment !== undefined) body.environment = payload.environment;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.transientEnvironment !== undefined) body.transient_environment = payload.transientEnvironment;
      if (payload.productionEnvironment !== undefined) body.production_environment = payload.productionEnvironment;
      const response = await clientFor("deployments.create").fetchJSON(`/repos/${payload.owner}/${payload.repo}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if ((response.status === 201 || response.status === 200) && isRecord(response.body)) {
        return { ok: true as const, deployment: normalizeGitHubDeployment(response.body as GitHubDeployment) };
      }
      return mapError(response.status, response.headers, "deployments.create");
    },

    async listStatuses(input: unknown) {
      const payload = validateListDeploymentStatusesInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await clientFor("deployments.statuses.list").fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/deployments/${payload.deploymentId}/statuses${qs}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, statuses: (response.body as GitHubDeploymentStatus[]).map(normalizeGitHubDeploymentStatus) };
      }
      return mapError(response.status, response.headers, "deployments.statuses.list");
    },

    async createStatus(input: unknown) {
      const payload = validateCreateDeploymentStatusInput(input);
      const body: Record<string, unknown> = { state: payload.state };
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.environment !== undefined) body.environment = payload.environment;
      if (payload.logUrl !== undefined) {
        body.log_url = payload.logUrl;
        body.target_url = payload.logUrl;
      }
      if (payload.environmentUrl !== undefined) body.environment_url = payload.environmentUrl;
      if (payload.autoInactive !== undefined) body.auto_inactive = payload.autoInactive;
      const response = await clientFor("deployments.statuses.create").fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/deployments/${payload.deploymentId}/statuses`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if ((response.status === 201 || response.status === 200) && isRecord(response.body)) {
        return { ok: true as const, status: normalizeGitHubDeploymentStatus(response.body as GitHubDeploymentStatus) };
      }
      return mapError(response.status, response.headers, "deployments.statuses.create");
    },

    async listEnvironments(input: unknown) {
      const payload = validateListEnvironmentsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await clientFor("environments.list").fetchJSON(`/repos/${payload.owner}/${payload.repo}/environments${qs}`);
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.environments)) {
        const environments = (response.body.environments as GitHubEnvironment[]).map(normalizeGitHubEnvironment);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : environments.length,
          environments,
        };
      }
      return mapError(response.status, response.headers, "environments.list");
    },

    async getEnvironment(input: unknown) {
      const payload = validateGetEnvironmentInput(input);
      const response = await clientFor("environments.get").fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/environments/${encodeURIComponent(payload.name)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, environment: normalizeGitHubEnvironment(response.body as GitHubEnvironment) };
      }
      return mapError(response.status, response.headers, "environments.get");
    },

    async createEnvironment(input: unknown) {
      const payload = validateCreateEnvironmentInput(input);
      const body: Record<string, unknown> = {};
      if (payload.waitTimer !== undefined) body.wait_timer = payload.waitTimer;
      if (payload.preventSelfReview !== undefined) body.prevent_self_review = payload.preventSelfReview;
      if (payload.reviewers !== undefined) {
        body.reviewers = payload.reviewers.map((reviewer) => ({ type: reviewer.type, id: reviewer.id }));
      }
      if (payload.deploymentBranchPolicy !== undefined) {
        body.deployment_branch_policy = payload.deploymentBranchPolicy === null ? null : {
          protected_branches: payload.deploymentBranchPolicy.protectedBranches,
          custom_branch_policies: payload.deploymentBranchPolicy.customBranchPolicies,
        };
      }
      const response = await clientFor("environments.create").fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/environments/${encodeURIComponent(payload.name)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if ((response.status === 200 || response.status === 201) && isRecord(response.body)) {
        return { ok: true as const, environment: normalizeGitHubEnvironment(response.body as GitHubEnvironment) };
      }
      return mapError(response.status, response.headers, "environments.create");
    },

    async deleteDeployment(input: unknown) {
      const payload = validateDeleteDeploymentInput(input);
      const response = await clientFor("deployments.delete").fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/deployments/${payload.deploymentId}`,
        { method: "DELETE" },
      );
      if (response.status === 204 || response.status === 404) {
        return { ok: true as const, deleted: true as const, deploymentId: payload.deploymentId };
      }
      return mapError(response.status, response.headers, "deployments.delete");
    },

    async deleteEnvironment(input: unknown) {
      const payload = validateDeleteEnvironmentInput(input);
      const response = await clientFor("environments.delete").fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/environments/${encodeURIComponent(payload.name)}`,
        { method: "DELETE" },
      );
      if (response.status === 204 || response.status === 404) {
        return { ok: true as const, deleted: true as const, name: payload.name };
      }
      return mapError(response.status, response.headers, "environments.delete");
    },
  };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalId(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
    return value;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const asBig = BigInt(value);
    if (asBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} must be a positive integer`);
    return Number(asBig);
  }
  throw new Error(`${field} must be a positive integer`);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalHttpUrl(value: unknown, field: string): string | undefined {
  const url = optionalString(value, field);
  if (url === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${field} must be an http(s) URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${field} must be an http(s) URL`);
  return url;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
