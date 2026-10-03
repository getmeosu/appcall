import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type RepoVariableInput = {
  owner: string;
  repo: string;
  name: string;
};

export type CreateActionsVariableInput = RepoVariableInput & { value: string };
export type UpdateActionsVariableInput = RepoVariableInput & { value: string };
export type DeleteActionsVariableInput = RepoVariableInput;

export type NormalizedActionsVariable = {
  name: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};

export function validateGetActionsVariableInput(input: unknown): RepoVariableInput {
  return validateRepoVariable(input, "get actions variable");
}

export function validateCreateActionsVariableInput(input: unknown): CreateActionsVariableInput {
  const scope = validateRepoVariable(input, "create actions variable");
  return { ...scope, value: requireString(record(input).value, "value") };
}

export function validateUpdateActionsVariableInput(input: unknown): UpdateActionsVariableInput {
  const scope = validateRepoVariable(input, "update actions variable");
  return { ...scope, value: requireString(record(input).value, "value") };
}

export function validateDeleteActionsVariableInput(input: unknown): DeleteActionsVariableInput {
  return validateRepoVariable(input, "delete actions variable");
}

export function normalizeActionsVariable(item: Record<string, unknown>, fallback?: { name: string; value: string }): NormalizedActionsVariable {
  return {
    name: typeof item.name === "string" ? item.name : (fallback?.name ?? ""),
    value: typeof item.value === "string" ? item.value : (fallback?.value ?? ""),
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function createActionsVariablesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "actions.variables.get",
  });

  async function getVariable(input: unknown) {
    const payload = validateGetActionsVariableInput(input);
    const response = await client.fetchJSON(variablePath(payload));
    if (response.status === 200 && isRecord(response.body)) {
      return { ok: true as const, variable: normalizeActionsVariable(response.body) };
    }
    if (response.status === 404) {
      return {
        ok: false as const,
        missing: true as const,
        error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Actions variable not found." },
      };
    }
    return mapRateOrUpstream(response, "GitHub rejected the get actions variable request.");
  }

  return {
    get: getVariable,

    async create(input: unknown) {
      const payload = validateCreateActionsVariableInput(input);
      const existing = await getVariable(payload);
      if (existing.ok) {
        return { ok: true as const, variable: existing.variable, created: false as const };
      }
      if (!("missing" in existing) || existing.missing !== true) {
        return existing;
      }
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/actions/variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, value: payload.value }),
      });
      if ((response.status === 201 || response.status === 200) && isRecord(response.body)) {
        return {
          ok: true as const,
          variable: normalizeActionsVariable(response.body, payload),
          created: true as const,
        };
      }
      if (response.status === 201 || response.status === 200) {
        return {
          ok: true as const,
          variable: normalizeActionsVariable({}, payload),
          created: true as const,
        };
      }
      if (response.status === 422) {
        // A concurrent create can win between the 404 and this POST.
        const raced = await getVariable(payload);
        if (raced.ok) {
          return { ok: true as const, variable: raced.variable, created: false as const };
        }
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Actions variable already exists or is invalid." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create actions variable request.");
    },

    async update(input: unknown) {
      const payload = validateUpdateActionsVariableInput(input);
      // Path name is the variable being updated. Body name stays the same so
      // Reconcile can observe via actions.variables.get on this input.
      const response = await client.fetchJSON(variablePath(payload), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: payload.name, value: payload.value }),
      });
      if (response.status === 204) {
        return { ok: true as const, updated: true as const, name: payload.name, value: payload.value };
      }
      if (response.status === 200 && isRecord(response.body)) {
        const variable = normalizeActionsVariable(response.body, payload);
        return { ok: true as const, updated: true as const, name: variable.name, value: variable.value, variable };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Actions variable not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for update actions variable." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the update actions variable request.");
    },

    async delete(input: unknown) {
      const payload = validateDeleteActionsVariableInput(input);
      const response = await client.fetchJSON(variablePath(payload), { method: "DELETE" });
      // 204 is gone. 404 is upstream: a missing repository is not proof the variable was deleted.
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, name: payload.name };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Actions variable not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the delete actions variable request.");
    },
  };
}

function validateRepoVariable(input: unknown, action: string): RepoVariableInput {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name: requireString(input.name, "name"),
  };
}

function record(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function variablePath(payload: RepoVariableInput): string {
  return `${repoPath(payload.owner, payload.repo)}/actions/variables/${encodeURIComponent(payload.name)}`;
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message } };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
