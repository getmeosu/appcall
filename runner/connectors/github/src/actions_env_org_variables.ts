import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

/** Repository Actions environment variable. Values are not secrets. */
export type NormalizedEnvActionsVariable = {
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

/** Organization Actions variable. Response carries visibility, not selected_repository_ids. */
export type NormalizedOrgActionsVariable = NormalizedEnvActionsVariable & {
  visibility: string;
  selectedRepositoriesUrl: string;
};

type EnvScope = { owner: string; repo: string; environmentName: string };
type EnvNamed = EnvScope & { name: string };
type EnvWrite = EnvNamed & { value: string };
type RepoScope = { owner: string; repo: string; perPage?: number; page?: number };
type OrgScope = { org: string; perPage?: number; page?: number };
type OrgNamed = { org: string; name: string };
type Visibility = "all" | "private" | "selected";
type OrgWrite = OrgNamed & {
  value: string;
  visibility: Visibility;
  selectedRepositoryIds?: number[];
};
type OrgUpdate = OrgWrite & { rename?: string };

export function validateListEnvironmentVariablesInput(input: unknown): EnvScope & { perPage?: number; page?: number } {
  if (!isRecord(input)) throw new Error("actions.environment_variables.list input must be an object");
  return { ...envScope(input), perPage: optionalPage(input.perPage, "perPage", 30), page: optionalPage(input.page, "page", 1_000_000) };
}

export function validateGetEnvironmentVariableInput(input: unknown): EnvNamed {
  if (!isRecord(input)) throw new Error("actions.environment_variables.get input must be an object");
  return { ...envScope(input), name: requireString(input.name, "name") };
}

export function validateCreateEnvironmentVariableInput(input: unknown): EnvWrite {
  const named = validateGetEnvironmentVariableInput(input);
  return { ...named, value: requireString(record(input).value, "value") };
}

export function validateUpdateEnvironmentVariableInput(input: unknown): EnvWrite {
  // Reconcile reuses this input for actions.environment_variables.get. name stays the path key.
  const named = validateGetEnvironmentVariableInput(input);
  return { ...named, value: requireString(record(input).value, "value") };
}

export function validateDeleteEnvironmentVariableInput(input: unknown): EnvNamed {
  return validateGetEnvironmentVariableInput(input);
}

export function validateListRepoOrgVariablesInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.org_variables.list_for_repo input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage", 30),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateListOrgVariablesInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("actions.org_variables.list input must be an object");
  return {
    org: requireString(input.org, "org"),
    perPage: optionalPage(input.perPage, "perPage", 30),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateGetOrgVariableInput(input: unknown): OrgNamed {
  if (!isRecord(input)) throw new Error("actions.org_variables.get input must be an object");
  return { org: requireString(input.org, "org"), name: requireString(input.name, "name") };
}

export function validateCreateOrgVariableInput(input: unknown): OrgWrite {
  return orgWrite(input, "actions.org_variables.create");
}

export function validateUpdateOrgVariableInput(input: unknown): OrgUpdate {
  const write = orgWrite(input, "actions.org_variables.update");
  const raw = record(input);
  const rename = raw.rename === undefined ? undefined : requireString(raw.rename, "rename");
  return { ...write, rename };
}

export function validateDeleteOrgVariableInput(input: unknown): OrgNamed {
  return validateGetOrgVariableInput(input);
}

export function normalizeEnvActionsVariable(
  item: Record<string, unknown>,
  fallback?: { name: string; value: string },
): NormalizedEnvActionsVariable {
  return {
    name: typeof item.name === "string" ? item.name : (fallback?.name ?? ""),
    value: typeof item.value === "string" ? item.value : (fallback?.value ?? ""),
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeOrgActionsVariable(
  item: Record<string, unknown>,
  fallback?: { name: string; value: string; visibility?: string },
): NormalizedOrgActionsVariable {
  return {
    ...normalizeEnvActionsVariable(item, fallback),
    visibility: typeof item.visibility === "string" ? item.visibility : (fallback?.visibility ?? ""),
    // Official GET/list returns selected_repositories_url, not selected_repository_ids.
    selectedRepositoriesUrl: typeof item.selected_repositories_url === "string" ? item.selected_repositories_url : "",
  };
}

export function createActionsEnvOrgVariablesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "actions.environment_variables.get",
  });

  async function getEnvironmentVariable(input: unknown) {
    const payload = validateGetEnvironmentVariableInput(input);
    const response = await client.fetchJSON(envVariablePath(payload));
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, variable: normalizeEnvActionsVariable(response.body) };
    }
    if (response.status === 404) {
      return {
        ok: false as const,
        missing: true as const,
        error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Environment variable not found." },
      };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get environment variable request.");
  }

  async function getOrgVariable(input: unknown) {
    const payload = validateGetOrgVariableInput(input);
    const response = await client.fetchJSON(orgVariablePath(payload));
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, variable: normalizeOrgActionsVariable(response.body) };
    }
    if (response.status === 404) {
      return {
        ok: false as const,
        missing: true as const,
        error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Organization variable not found." },
      };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get organization variable request.");
  }

  return {
    async listEnvironmentVariables(input: unknown) {
      const payload = validateListEnvironmentVariablesInput(input);
      const response = await client.fetchJSON(`${envCollectionPath(payload)}${pageQuery(payload)}`);
      return mapVariableList(response, "list environment variables", false);
    },

    getEnvironmentVariable,

    async createEnvironmentVariable(input: unknown) {
      const payload = validateCreateEnvironmentVariableInput(input);
      const existing = await getEnvironmentVariable(payload);
      if (existing.ok) {
        // POST does not change an existing value. Skip it.
        return { ok: true as const, variable: existing.variable, created: false as const };
      }
      if (!("missing" in existing) || existing.missing !== true) return existing;
      const response = await client.fetchJSON(envCollectionPath(payload), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, value: payload.value }),
      });
      return mapCreate(response, payload, () => getEnvironmentVariable(payload), "environment variable");
    },

    async updateEnvironmentVariable(input: unknown) {
      const payload = validateUpdateEnvironmentVariableInput(input);
      // Path name is the observe key. Body name stays that name (no rename input).
      const response = await client.fetchJSON(envVariablePath(payload), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, value: payload.value }),
      });
      if (response.status === 204) {
        return { ok: true as const, updated: true as const, name: payload.name, value: payload.value };
      }
      if (response.status === 200 && isRecord(response.body)) {
        const variable = normalizeEnvActionsVariable(response.body, payload);
        return { ok: true as const, updated: true as const, name: variable.name, value: variable.value, variable };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Environment variable not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Validation failed for update environment variable." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the update environment variable request.");
    },

    async deleteEnvironmentVariable(input: unknown) {
      const payload = validateDeleteEnvironmentVariableInput(input);
      return deleteAfterObserve(payload.name, () => getEnvironmentVariable(payload), envVariablePath(payload), "environment variable");
    },

    async listRepoOrgVariables(input: unknown) {
      const payload = validateListRepoOrgVariablesInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/actions/organization-variables${pageQuery(payload)}`);
      return mapVariableList(response, "list repository organization variables", false);
    },

    async listOrgVariables(input: unknown) {
      const payload = validateListOrgVariablesInput(input);
      const response = await client.fetchJSON(`${orgCollectionPath(payload.org)}${pageQuery(payload)}`);
      return mapVariableList(response, "list organization variables", true);
    },

    getOrgVariable,

    async createOrgVariable(input: unknown) {
      const payload = validateCreateOrgVariableInput(input);
      const existing = await getOrgVariable(payload);
      if (existing.ok) {
        return { ok: true as const, variable: existing.variable, created: false as const };
      }
      if (!("missing" in existing) || existing.missing !== true) return existing;
      const response = await client.fetchJSON(orgCollectionPath(payload.org), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgCreateBody(payload)),
      });
      return mapCreate(response, payload, () => getOrgVariable(payload), "organization variable");
    },

    async updateOrgVariable(input: unknown) {
      const payload = validateUpdateOrgVariableInput(input);
      // Path stays payload.name so Reconcile can observe actions.org_variables.get.
      // rename, when set, is the body name only.
      const response = await client.fetchJSON(orgVariablePath(payload), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgUpdateBody(payload)),
      });
      if (response.status === 204) {
        return {
          ok: true as const,
          updated: true as const,
          name: payload.name,
          value: payload.value,
          visibility: payload.visibility,
          ...(payload.rename !== undefined ? { rename: payload.rename } : {}),
        };
      }
      if (response.status === 200 && isRecord(response.body)) {
        const variable = normalizeOrgActionsVariable(response.body, payload);
        return { ok: true as const, updated: true as const, name: payload.name, value: variable.value, visibility: variable.visibility, variable };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Organization variable not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Validation failed for update organization variable." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the update organization variable request.");
    },

    async deleteOrgVariable(input: unknown) {
      const payload = validateDeleteOrgVariableInput(input);
      return deleteAfterObserve(payload.name, () => getOrgVariable(payload), orgVariablePath(payload), "organization variable");
    },
  };

  async function deleteAfterObserve(
    name: string,
    observe: () => Promise<{ ok: true; variable: unknown } | { ok: false; missing?: boolean; error: { code: string; message: string; retryAfterSeconds?: number } }>,
    path: string,
    label: string,
  ) {
    const existing = await observe();
    if (!existing.ok) {
      // Already absent: idempotent success. Do not call DELETE.
      if ("missing" in existing && existing.missing === true) {
        return { ok: true as const, deleted: true as const, name };
      }
      return existing;
    }
    const response = await client.fetchJSON(path, { method: "DELETE" });
    if (response.status === 204) {
      return { ok: true as const, deleted: true as const, name };
    }
    // A 404 from DELETE itself is not a second success (repo missing, race, or a bad path).
    if (response.status === 404) {
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `${capitalize(label)} not found.` } };
    }
    return mapRateOrUpstream(response, `GitHub rejected the delete ${label} request.`);
  }
}

function mapCreate(
  response: { status: number; body: unknown; headers: Record<string, string> },
  payload: { name: string; value: string; visibility?: string },
  reread: () => Promise<{ ok: boolean; variable?: NormalizedEnvActionsVariable | NormalizedOrgActionsVariable }>,
  label: string,
) {
  const fallback = { name: payload.name, value: payload.value, visibility: payload.visibility };
  if ((response.status === 201 || response.status === 200) && isRecord(response.body)) {
    const variable = payload.visibility !== undefined
      ? normalizeOrgActionsVariable(response.body, fallback)
      : normalizeEnvActionsVariable(response.body, payload);
    return { ok: true as const, variable, created: true as const };
  }
  if (response.status === 201 || response.status === 200) {
    const variable = payload.visibility !== undefined
      ? normalizeOrgActionsVariable({}, fallback)
      : normalizeEnvActionsVariable({}, payload);
    return { ok: true as const, variable, created: true as const };
  }
  if (response.status === 422) {
    return reread().then((raced) => {
      if (raced.ok && raced.variable) {
        return { ok: true as const, variable: raced.variable, created: false as const };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `${capitalize(label)} already exists or is invalid.` } };
    });
  }
  return mapRateOrUpstream(response, `GitHub rejected the create ${label} request.`);
}

function mapVariableList(response: { status: number; body: unknown; headers: Record<string, string> }, action: string, org: boolean) {
  if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.variables)) {
    const variables = response.body.variables.filter(isRecord).map((item) => (
      org ? normalizeOrgActionsVariable(item) : normalizeEnvActionsVariable(item)
    ));
    return {
      ok: true as const,
      totalCount: typeof response.body.total_count === "number" ? response.body.total_count : variables.length,
      variables,
    };
  }
  return mapRateOrUpstream(response, `GitHub rejected the ${action} request.`);
}

function orgCreateBody(payload: OrgWrite): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: payload.name,
    value: payload.value,
    visibility: payload.visibility,
  };
  if (payload.visibility === "selected") body.selected_repository_ids = payload.selectedRepositoryIds;
  return body;
}

function orgUpdateBody(payload: OrgUpdate): Record<string, unknown> {
  // name in the body is the rename only. The path name stays the observe key.
  const body: Record<string, unknown> = {
    value: payload.value,
    visibility: payload.visibility,
  };
  if (payload.rename !== undefined) body.name = payload.rename;
  if (payload.visibility === "selected") body.selected_repository_ids = payload.selectedRepositoryIds;
  return body;
}

function envScope(input: Record<string, unknown>): EnvScope {
  // Public input is environment_name. Internal re-entry (create/delete observe) uses environmentName.
  const environmentName = typeof input.environment_name === "string" ? input.environment_name : input.environmentName;
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    environmentName: requireString(environmentName, "environment_name"),
  };
}

function orgWrite(input: unknown, action: string): OrgWrite {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  const visibility = input.visibility;
  if (visibility !== "all" && visibility !== "private" && visibility !== "selected") {
    throw new Error("visibility must be all, private, or selected");
  }
  const ids = selectedRepositoryIds(input.selected_repository_ids, visibility);
  return {
    org: requireString(input.org, "org"),
    name: requireString(input.name, "name"),
    value: requireString(input.value, "value"),
    visibility,
    selectedRepositoryIds: ids,
  };
}

function selectedRepositoryIds(value: unknown, visibility: Visibility): number[] | undefined {
  if (visibility !== "selected") {
    if (value !== undefined) throw new Error("selected_repository_ids is only allowed when visibility is selected");
    return undefined;
  }
  if (!Array.isArray(value)) throw new Error("selected_repository_ids is required when visibility is selected");
  return value.map((id, index) => {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
      throw new Error(`selected_repository_ids[${index}] must be a positive integer`);
    }
    return id;
  });
}

function envCollectionPath(payload: EnvScope): string {
  return `${repoPath(payload.owner, payload.repo)}/environments/${encodeURIComponent(payload.environmentName)}/variables`;
}

function envVariablePath(payload: EnvNamed): string {
  return `${envCollectionPath(payload)}/${encodeURIComponent(payload.name)}`;
}

function orgCollectionPath(org: string): string {
  return `/orgs/${encodeURIComponent(org)}/actions/variables`;
}

function orgVariablePath(payload: OrgNamed): string {
  return `${orgCollectionPath(payload.org)}/${encodeURIComponent(payload.name)}`;
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
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
  if (response.status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function record(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
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

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

