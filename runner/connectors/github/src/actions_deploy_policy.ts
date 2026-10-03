import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { executionContext } from "../../../bun/src/execution";
import manifest from "../manifest.json";

type RepoScope = { owner: string; repo: string };
type WorkflowPermissions = RepoScope & {
  defaultWorkflowPermissions: "read" | "write";
  canApprovePullRequestReviews: boolean;
};
type ActionsPermissions = RepoScope & {
  enabled: boolean;
  allowedActions?: "all" | "local_only" | "selected";
};
type SelectedActions = RepoScope & {
  githubOwnedAllowed: boolean;
  verifiedAllowed: boolean;
  patternsAllowed: string[];
};
type EnvScope = RepoScope & { environmentName: string; perPage?: number; page?: number };
type PolicyId = EnvScope & { branchPolicyId: number };
type PolicyWrite = EnvScope & { name: string; type: "branch" | "tag"; branchPolicyId?: number };

export type NormalizedWorkflowPermissions = {
  defaultWorkflowPermissions: string;
  canApprovePullRequestReviews: boolean;
};

export type NormalizedActionsPermissions = {
  enabled: boolean;
  allowedActions: string;
};

export type NormalizedSelectedActions = {
  githubOwnedAllowed: boolean;
  verifiedAllowed: boolean;
  patternsAllowed: string[];
};

export type NormalizedBranchPolicy = {
  id: number;
  name: string;
  type: string;
  nodeId: string;
};

export function validateGetWorkflowPermissionsInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.permissions.workflow.get input must be an object");
  return repo(input);
}

export function validateSetWorkflowPermissionsInput(input: unknown): WorkflowPermissions {
  const scope = validateGetWorkflowPermissionsInput(input);
  const raw = record(input);
  const permissions = raw.default_workflow_permissions;
  if (permissions !== "read" && permissions !== "write") {
    throw new Error("default_workflow_permissions must be read or write");
  }
  if (typeof raw.can_approve_pull_request_reviews !== "boolean") {
    throw new Error("can_approve_pull_request_reviews must be a boolean");
  }
  return {
    ...scope,
    defaultWorkflowPermissions: permissions,
    canApprovePullRequestReviews: raw.can_approve_pull_request_reviews,
  };
}

export function validateGetActionsPermissionsInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.permissions.get input must be an object");
  return repo(input);
}

export function validateSetActionsPermissionsInput(input: unknown): ActionsPermissions {
  const scope = validateGetActionsPermissionsInput(input);
  const raw = record(input);
  if (typeof raw.enabled !== "boolean") throw new Error("enabled must be a boolean");
  const allowed = raw.allowed_actions;
  if (allowed !== "all" && allowed !== "local_only" && allowed !== "selected") {
    throw new Error("allowed_actions must be all, local_only, or selected");
  }
  return { ...scope, enabled: raw.enabled, allowedActions: allowed };
}

export function validateGetSelectedActionsInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.permissions.selected_actions.get input must be an object");
  return repo(input);
}

export function validateSetSelectedActionsInput(input: unknown): SelectedActions {
  const scope = validateGetSelectedActionsInput(input);
  const raw = record(input);
  if (typeof raw.github_owned_allowed !== "boolean") throw new Error("github_owned_allowed must be a boolean");
  if (typeof raw.verified_allowed !== "boolean") throw new Error("verified_allowed must be a boolean");
  const patterns = raw.patterns_allowed === undefined ? [] : stringList(raw.patterns_allowed, "patterns_allowed");
  return {
    ...scope,
    githubOwnedAllowed: raw.github_owned_allowed,
    verifiedAllowed: raw.verified_allowed,
    patternsAllowed: patterns,
  };
}

export function validateListBranchPoliciesInput(input: unknown): EnvScope {
  if (!isRecord(input)) throw new Error("deployments.branch_policies.list input must be an object");
  return {
    ...env(input),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateGetBranchPolicyInput(input: unknown): PolicyId {
  if (!isRecord(input)) throw new Error("deployments.branch_policies.get input must be an object");
  const rawId = input.branch_policy_id !== undefined ? input.branch_policy_id : input.branchPolicyId;
  return { ...env(input), branchPolicyId: requireId(rawId, "branch_policy_id") };
}

export function validateCreateBranchPolicyInput(input: unknown): PolicyWrite {
  if (!isRecord(input)) throw new Error("deployments.branch_policies.create input must be an object");
  return { ...env(input), ...policyBody(input) };
}

export function validateUpdateBranchPolicyInput(input: unknown): PolicyId & { name: string; type: "branch" | "tag" } {
  const id = validateGetBranchPolicyInput(input);
  return { ...id, ...policyBody(record(input)) };
}

export function validateDeleteBranchPolicyInput(input: unknown): PolicyId {
  return validateGetBranchPolicyInput(input);
}

export function normalizeWorkflowPermissions(item: Record<string, unknown>): NormalizedWorkflowPermissions {
  return {
    defaultWorkflowPermissions: typeof item.default_workflow_permissions === "string" ? item.default_workflow_permissions : "",
    canApprovePullRequestReviews: item.can_approve_pull_request_reviews === true,
  };
}

export function normalizeActionsPermissions(item: Record<string, unknown>): NormalizedActionsPermissions {
  return {
    enabled: item.enabled === true,
    allowedActions: typeof item.allowed_actions === "string" ? item.allowed_actions : "",
  };
}

export function normalizeSelectedActions(item: Record<string, unknown>): NormalizedSelectedActions {
  return {
    githubOwnedAllowed: item.github_owned_allowed === true,
    verifiedAllowed: item.verified_allowed === true,
    patternsAllowed: Array.isArray(item.patterns_allowed) ? item.patterns_allowed.filter((p): p is string => typeof p === "string") : [],
  };
}

export function normalizeBranchPolicy(item: Record<string, unknown>, fallback?: { name: string; type: string }): NormalizedBranchPolicy {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : (fallback?.name ?? ""),
    type: typeof item.type === "string" ? item.type : (fallback?.type ?? ""),
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
  };
}

export function createActionsDeployPolicyClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const fetchImpl = options.fetch ?? fetch;
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "actions.permissions.get",
  });

  async function getWorkflowPermissions(input: unknown) {
    const payload = validateGetWorkflowPermissionsInput(input);
    const response = await client.fetchJSON(`${repoPath(payload)}/actions/permissions/workflow`);
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, permissions: normalizeWorkflowPermissions(response.body) };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get workflow permissions request.");
  }

  async function getActionsPermissions(input: unknown) {
    const payload = validateGetActionsPermissionsInput(input);
    const response = await client.fetchJSON(`${repoPath(payload)}/actions/permissions`);
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, permissions: normalizeActionsPermissions(response.body) };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get actions permissions request.");
  }

  async function getSelectedActions(input: unknown) {
    const payload = validateGetSelectedActionsInput(input);
    const response = await client.fetchJSON(`${repoPath(payload)}/actions/permissions/selected-actions`);
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, selectedActions: normalizeSelectedActions(response.body) };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get selected actions request.");
  }

  async function getBranchPolicy(input: unknown) {
    const payload = validateGetBranchPolicyInput(input);
    const response = await client.fetchJSON(policyPath(payload));
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, policy: normalizeBranchPolicy(response.body) };
    }
    if (response.status === 404) {
      return {
        ok: false as const,
        missing: true as const,
        error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Deployment branch policy not found." },
      };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get deployment branch policy request.");
  }

  async function listBranchPolicies(input: unknown) {
    const payload = validateListBranchPoliciesInput(input);
    const response = await client.fetchJSON(`${policiesPath(payload)}${pageQuery(payload)}`);
    if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.branch_policies)) {
      const policies = response.body.branch_policies.filter(isRecord).map((item) => normalizeBranchPolicy(item));
      return {
        ok: true as const,
        totalCount: typeof response.body.total_count === "number" ? response.body.total_count : policies.length,
        policies,
      };
    }
    if (response.status === 404) {
      return {
        ok: false as const,
        error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Environment not found or custom deployment branch policies are disabled." },
      };
    }
    return mapRateOrUpstream(response, "GitHub rejected the list deployment branch policies request.");
  }

  return {
    getWorkflowPermissions,

    async setWorkflowPermissions(input: unknown) {
      const payload = validateSetWorkflowPermissionsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/actions/permissions/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_workflow_permissions: payload.defaultWorkflowPermissions,
          can_approve_pull_request_reviews: payload.canApprovePullRequestReviews,
        }),
      });
      if (response.status === 204) {
        return {
          ok: true as const,
          permissions: {
            defaultWorkflowPermissions: payload.defaultWorkflowPermissions,
            canApprovePullRequestReviews: payload.canApprovePullRequestReviews,
          },
        };
      }
      // 409: the organization blocked the change. State did not move. Not success.
      if (response.status === 409) {
        return {
          ok: false as const,
          error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Organization policy blocked the workflow permissions change. State did not move." },
        };
      }
      return mapRateOrUpstream(response, "GitHub rejected the set workflow permissions request.");
    },

    getActionsPermissions,

    async setActionsPermissions(input: unknown) {
      const payload = validateSetActionsPermissionsInput(input);
      const body: Record<string, unknown> = { enabled: payload.enabled };
      if (payload.allowedActions !== undefined) body.allowed_actions = payload.allowedActions;
      const response = await client.fetchJSON(`${repoPath(payload)}/actions/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 204) {
        return {
          ok: true as const,
          permissions: { enabled: payload.enabled, allowedActions: payload.allowedActions ?? "" },
        };
      }
      return mapRateOrUpstream(response, "GitHub rejected the set actions permissions request.");
    },

    getSelectedActions,

    async setSelectedActions(input: unknown) {
      const payload = validateSetSelectedActionsInput(input);
      const current = await getActionsPermissions(payload);
      if (!current.ok) return current;
      if (current.permissions.allowedActions !== "selected") {
        return {
          ok: false as const,
          error: {
            code: "CONNECTOR_UPSTREAM_ERROR" as const,
            message: "allowed_actions must be selected before setting selected actions. actions.permissions.set can establish that. State did not move.",
          },
        };
      }
      const response = await client.fetchJSON(`${repoPath(payload)}/actions/permissions/selected-actions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          github_owned_allowed: payload.githubOwnedAllowed,
          verified_allowed: payload.verifiedAllowed,
          patterns_allowed: payload.patternsAllowed,
        }),
      });
      if (response.status === 204) {
        return {
          ok: true as const,
          selectedActions: {
            githubOwnedAllowed: payload.githubOwnedAllowed,
            verifiedAllowed: payload.verifiedAllowed,
            patternsAllowed: payload.patternsAllowed,
          },
        };
      }
      if (response.status === 409) {
        return {
          ok: false as const,
          error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Selected actions were rejected because allowed_actions is not selected. State did not move." },
        };
      }
      return mapRateOrUpstream(response, "GitHub rejected the set selected actions request.");
    },

    listBranchPolicies,

    getBranchPolicy,

    async createBranchPolicy(input: unknown) {
      const payload = validateCreateBranchPolicyInput(input);
      const listed = await listBranchPolicies(payload);
      if (!listed.ok) return listed;
      const existing = listed.policies.find((policy) => policy.name === payload.name && policy.type === payload.type);
      if (existing) {
        // Name pattern already present. Do not POST.
        return { ok: true as const, policy: existing, created: false as const };
      }
      // POST once. 303 is already-exists and must not be followed or retried.
      const response = await postPolicy(fetchImpl, options.accessToken, policiesPath(payload), { name: payload.name, type: payload.type });
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, policy: normalizeBranchPolicy(response.body, payload), created: true as const };
      }
      if (response.status === 200) {
        return { ok: true as const, policy: normalizeBranchPolicy({}, payload), created: true as const };
      }
      if (response.status === 303) {
        const fromBody = isRecord(response.body) ? normalizeBranchPolicy(response.body, payload) : normalizeBranchPolicy({}, payload);
        const located = policyIdFromLocation(response.headers);
        const policy = fromBody.id > 0 || located === undefined ? fromBody : { ...fromBody, id: located };
        return { ok: true as const, policy, created: false as const, alreadyExisted: true as const };
      }
      if (response.status === 404) {
        return {
          ok: false as const,
          error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Environment not found or custom deployment branch policies are disabled." },
        };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create deployment branch policy request.");
    },

    async updateBranchPolicy(input: unknown) {
      const payload = validateUpdateBranchPolicyInput(input);
      const response = await client.fetchJSON(policyPath(payload), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, type: payload.type }),
      });
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, policy: normalizeBranchPolicy(response.body, payload) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Deployment branch policy not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the update deployment branch policy request.");
    },

    async deleteBranchPolicy(input: unknown) {
      const payload = validateDeleteBranchPolicyInput(input);
      const existing = await getBranchPolicy(payload);
      if (!existing.ok) {
        if ("missing" in existing && existing.missing === true) {
          return { ok: true as const, deleted: true as const, branchPolicyId: payload.branchPolicyId, alreadyGone: true as const };
        }
        return existing;
      }
      const response = await client.fetchJSON(policyPath(payload), { method: "DELETE" });
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, branchPolicyId: payload.branchPolicyId, alreadyGone: false as const };
      }
      // A 404 from DELETE itself is upstream, not a second success.
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Deployment branch policy not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the delete deployment branch policy request.");
    },
  };
}


async function postPolicy(fetchImpl: typeof fetch, accessToken: string, path: string, body: Record<string, unknown>) {
  const spec = (manifest.operations as Record<string, { timeoutMs?: number }>)["deployments.branch_policies.create"];
  const timeoutMs = spec?.timeoutMs ?? 15000;
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
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  // Do not follow Location. A 303 means the name pattern already exists.
  let parsed: unknown = null;
  if (response.status !== 303 && response.status !== 204) {
    const text = await response.text();
    const maxBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)["deployments.branch_policies.create"]?.maxResponseBytes ?? 1048576;
    if (text.length > maxBytes) {
      return { status: 413, headers, body: null };
    }
    if (text.length > 0) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
  }
  return { status: response.status, headers, body: parsed };
}


function policyIdFromLocation(headers: Record<string, string>): number | undefined {
  const location = headers.location ?? headers.Location ?? "";
  const match = location.match(/\/deployment-branch-policies\/(\d+)(?:$|[?#])/);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function policyBody(input: Record<string, unknown>): { name: string; type: "branch" | "tag" } {
  const type = input.type;
  if (type !== "branch" && type !== "tag") throw new Error("type must be branch or tag");
  return { name: requireString(input.name, "name"), type };
}

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: requireString(input.owner, "owner"), repo: requireString(input.repo, "repo") };
}

function env(input: Record<string, unknown>): EnvScope {
  const environmentName = typeof input.environment_name === "string" ? input.environment_name : input.environmentName;
  return { ...repo(input), environmentName: requireString(environmentName, "environment_name") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`;
}

function policiesPath(payload: EnvScope): string {
  return `${repoPath(payload)}/environments/${encodeURIComponent(payload.environmentName)}/deployment-branch-policies`;
}

function policyPath(payload: PolicyId): string {
  return `${policiesPath(payload)}/${payload.branchPolicyId}`;
}

function pageQuery(payload: { perPage?: number; page?: number }): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
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
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array of strings`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) throw new Error(`${field}[${index}] must be a non-empty string`);
    return item;
  });
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function record(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
