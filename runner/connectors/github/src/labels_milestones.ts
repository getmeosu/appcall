import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v.length > 0) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function rateLimited(status: number, headers: Record<string, string>) {
  const rateLimit = parseGitHubRateLimit(status, headers);
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
    },
  };
}

function isRateLimited(status: number, headers: Record<string, string>): boolean {
  return status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export type NormalizedLabel = {
  id: string;
  provider: "github";
  providerLabelId: number;
  name: string;
  color: string;
  description: string;
  default: boolean;
  url: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeLabel(item: Record<string, unknown>): NormalizedLabel {
  return {
    id: `gh-label:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerLabelId: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    color: typeof item.color === "string" ? item.color : "",
    description: typeof item.description === "string" ? item.description : "",
    default: item.default === true,
    url: typeof item.url === "string" ? item.url : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type GetLabelInput = { owner: string; repo: string; name: string; newName?: string };
export function validateGetLabelInput(input: unknown): GetLabelInput {
  if (!isRecord(input)) throw new Error("get label input must be an object");
  // Prefer newName when present so labels.update Reconcile observes the post-rename name.
  const newName = optionalString(input.newName, "newName");
  const name = newName ?? requireString(input.name, "name");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name,
    newName,
  };
}

export type CreateLabelInput = {
  owner: string;
  repo: string;
  name: string;
  color: string;
  description?: string;
};
export function validateCreateLabelInput(input: unknown): CreateLabelInput {
  if (!isRecord(input)) throw new Error("create label input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name: requireString(input.name, "name"),
    color: requireString(input.color, "color"),
    description: optionalString(input.description, "description"),
  };
}

export type UpdateLabelInput = {
  owner: string;
  repo: string;
  name: string;
  newName?: string;
  color?: string;
  description?: string;
};
export function validateUpdateLabelInput(input: unknown): UpdateLabelInput {
  if (!isRecord(input)) throw new Error("update label input must be an object");
  const newName = optionalString(input.newName, "newName");
  const color = optionalString(input.color, "color");
  const description = optionalString(input.description, "description");
  if (newName === undefined && color === undefined && description === undefined) {
    throw new Error("at least one of newName, color, or description is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name: requireString(input.name, "name"),
    newName,
    color,
    description,
  };
}

export type DeleteLabelInput = GetLabelInput;
export function validateDeleteLabelInput(input: unknown): DeleteLabelInput {
  return validateGetLabelInput(input);
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export type NormalizedMilestone = {
  id: string;
  provider: "github";
  providerMilestoneId: number;
  number: number;
  title: string;
  description: string;
  state: string;
  openIssues: number;
  closedIssues: number;
  url: string;
  htmlUrl: string;
  dueOn: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
  creator: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeMilestone(item: Record<string, unknown>): NormalizedMilestone {
  const creator = isRecord(item.creator) ? item.creator : {};
  return {
    id: `gh-milestone:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerMilestoneId: typeof item.id === "number" ? item.id : 0,
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    description: typeof item.description === "string" ? item.description : "",
    state: typeof item.state === "string" ? item.state : "",
    openIssues: typeof item.open_issues === "number" ? item.open_issues : 0,
    closedIssues: typeof item.closed_issues === "number" ? item.closed_issues : 0,
    url: typeof item.url === "string" ? item.url : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    dueOn: typeof item.due_on === "string" ? item.due_on : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    closedAt: typeof item.closed_at === "string" ? item.closed_at : "",
    creator: typeof creator.login === "string" ? creator.login : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type ListMilestonesInput = {
  owner: string;
  repo: string;
  state?: string;
  sort?: string;
  direction?: string;
  perPage?: number;
  page?: number;
};
export function validateListMilestonesInput(input: unknown): ListMilestonesInput {
  if (!isRecord(input)) throw new Error("list milestones input must be an object");
  const state = optionalString(input.state, "state");
  if (state !== undefined && state !== "open" && state !== "closed" && state !== "all") {
    throw new Error("state must be open, closed, or all");
  }
  const sort = optionalString(input.sort, "sort");
  if (sort !== undefined && sort !== "due_on" && sort !== "completeness") {
    throw new Error("sort must be due_on or completeness");
  }
  const direction = optionalString(input.direction, "direction");
  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    throw new Error("direction must be asc or desc");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    state,
    sort,
    direction,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetMilestoneInput = { owner: string; repo: string; milestoneNumber: number };
export function validateGetMilestoneInput(input: unknown): GetMilestoneInput {
  if (!isRecord(input)) throw new Error("get milestone input must be an object");
  // Idempotent milestones.create projects `id` from the primary response; accept it as milestoneNumber.
  let milestoneNumber: number;
  if (input.milestoneNumber !== undefined) {
    milestoneNumber = requireNumber(input.milestoneNumber, "milestoneNumber");
  } else if (typeof input.id === "number") {
    milestoneNumber = requireNumber(input.id, "id");
  } else if (typeof input.id === "string" && /^\d+$/.test(input.id)) {
    milestoneNumber = requireNumber(Number(input.id), "id");
  } else {
    throw new Error("milestoneNumber is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    milestoneNumber,
  };
}

export type CreateMilestoneInput = {
  owner: string;
  repo: string;
  title: string;
  state?: string;
  description?: string;
  dueOn?: string;
};
export function validateCreateMilestoneInput(input: unknown): CreateMilestoneInput {
  if (!isRecord(input)) throw new Error("create milestone input must be an object");
  const state = optionalString(input.state, "state");
  if (state !== undefined && state !== "open" && state !== "closed") {
    throw new Error("state must be open or closed");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    title: requireString(input.title, "title"),
    state,
    description: optionalString(input.description, "description"),
    dueOn: optionalString(input.dueOn, "dueOn"),
  };
}

export type UpdateMilestoneInput = {
  owner: string;
  repo: string;
  milestoneNumber: number;
  title?: string;
  state?: string;
  description?: string;
  dueOn?: string | null;
};
export function validateUpdateMilestoneInput(input: unknown): UpdateMilestoneInput {
  if (!isRecord(input)) throw new Error("update milestone input must be an object");
  const title = optionalString(input.title, "title");
  const state = optionalString(input.state, "state");
  if (state !== undefined && state !== "open" && state !== "closed") {
    throw new Error("state must be open or closed");
  }
  const description = optionalString(input.description, "description");
  let dueOn: string | null | undefined;
  if (input.dueOn === null) dueOn = null;
  else if (input.dueOn !== undefined) dueOn = optionalString(input.dueOn, "dueOn");
  if (title === undefined && state === undefined && description === undefined && dueOn === undefined) {
    throw new Error("at least one of title, state, description, or dueOn is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    milestoneNumber: requireNumber(input.milestoneNumber, "milestoneNumber"),
    title,
    state,
    description,
    dueOn,
  };
}

// ─── Collaborators ────────────────────────────────────────────────────────────

export type NormalizedCollaborator = {
  id: string;
  provider: "github";
  providerUserId: number;
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  type: string;
  siteAdmin: boolean;
  permissions: Record<string, boolean>;
  roleName: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeCollaborator(item: Record<string, unknown>): NormalizedCollaborator {
  const permissions = isRecord(item.permissions)
    ? Object.fromEntries(
        Object.entries(item.permissions).filter(([, v]) => typeof v === "boolean") as [string, boolean][],
      )
    : {};
  return {
    id: `gh-user:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerUserId: typeof item.id === "number" ? item.id : 0,
    login: typeof item.login === "string" ? item.login : "",
    avatarUrl: typeof item.avatar_url === "string" ? item.avatar_url : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    type: typeof item.type === "string" ? item.type : "",
    siteAdmin: item.site_admin === true,
    permissions,
    roleName: typeof item.role_name === "string" ? item.role_name : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type ListCollaboratorsInput = {
  owner: string;
  repo: string;
  affiliation?: string;
  permission?: string;
  perPage?: number;
  page?: number;
};
export function validateListCollaboratorsInput(input: unknown): ListCollaboratorsInput {
  if (!isRecord(input)) throw new Error("list collaborators input must be an object");
  const affiliation = optionalString(input.affiliation, "affiliation");
  if (
    affiliation !== undefined &&
    affiliation !== "outside" &&
    affiliation !== "direct" &&
    affiliation !== "all"
  ) {
    throw new Error("affiliation must be outside, direct, or all");
  }
  const permission = optionalString(input.permission, "permission");
  if (
    permission !== undefined &&
    !["pull", "triage", "push", "maintain", "admin"].includes(permission)
  ) {
    throw new Error("permission must be pull, triage, push, maintain, or admin");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    affiliation,
    permission,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type AddCollaboratorInput = {
  owner: string;
  repo: string;
  username: string;
  permission?: string;
};
export function validateAddCollaboratorInput(input: unknown): AddCollaboratorInput {
  if (!isRecord(input)) throw new Error("add collaborator input must be an object");
  const permission = optionalString(input.permission, "permission");
  if (
    permission !== undefined &&
    !["pull", "triage", "push", "maintain", "admin"].includes(permission)
  ) {
    throw new Error("permission must be pull, triage, push, maintain, or admin");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    username: requireString(input.username, "username"),
    permission,
  };
}

export type RemoveCollaboratorInput = { owner: string; repo: string; username: string };
export function validateRemoveCollaboratorInput(input: unknown): RemoveCollaboratorInput {
  if (!isRecord(input)) throw new Error("remove collaborator input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    username: requireString(input.username, "username"),
  };
}

export type CheckCollaboratorInput = RemoveCollaboratorInput;
export function validateCheckCollaboratorInput(input: unknown): CheckCollaboratorInput {
  return validateRemoveCollaboratorInput(input);
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createLabelsMilestonesClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const clientFor = (operation: string): GitHubClient =>
    options.githubClient ??
    createGitHubClient({
      accessToken: options.accessToken,
      fetch: options.fetch,
      operation,
    });

  return {
    async getLabel(input: unknown) {
      const payload = validateGetLabelInput(input);
      const client = clientFor("labels.get");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/labels/${encodeURIComponent(payload.name)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, found: true as const, label: normalizeLabel(response.body) };
      }
      // Soft-not-found so labels.delete Reconcile (observe via labels.get) can confirm absence.
      if (response.status === 404) {
        return { ok: true as const, found: false as const, label: null, name: payload.name };
      }
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the get label request.");
    },

    async createLabel(input: unknown) {
      const payload = validateCreateLabelInput(input);
      const client = clientFor("labels.create");
      const body: Record<string, string> = { name: payload.name, color: payload.color };
      if (payload.description !== undefined) body.description = payload.description;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, label: normalizeLabel(response.body) };
      }
      if (response.status === 404) return upstream("Repository not found.");
      if (response.status === 422) return upstream("Label validation failed or name already exists.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the create label request.");
    },

    async updateLabel(input: unknown) {
      const payload = validateUpdateLabelInput(input);
      const client = clientFor("labels.update");
      const body: Record<string, string> = {};
      if (payload.newName !== undefined) body.new_name = payload.newName;
      if (payload.color !== undefined) body.color = payload.color;
      if (payload.description !== undefined) body.description = payload.description;
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/labels/${encodeURIComponent(payload.name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, label: normalizeLabel(response.body) };
      }
      if (response.status === 404) return upstream("Label not found.");
      if (response.status === 422) return upstream("Label validation failed.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the update label request.");
    },

    async deleteLabel(input: unknown) {
      const payload = validateDeleteLabelInput(input);
      const client = clientFor("labels.delete");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/labels/${encodeURIComponent(payload.name)}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, name: payload.name };
      }
      if (response.status === 404) return upstream("Label not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the delete label request.");
    },

    async listMilestones(input: unknown) {
      const payload = validateListMilestonesInput(input);
      const client = clientFor("milestones.list");
      const path =
        `/repos/${payload.owner}/${payload.repo}/milestones` +
        qs({
          state: payload.state,
          sort: payload.sort,
          direction: payload.direction,
          per_page: payload.perPage ? String(payload.perPage) : undefined,
          page: payload.page ? String(payload.page) : undefined,
        });
      const response = await client.fetchJSON(path);
      if (response.status === 200) {
        const raw = Array.isArray(response.body) ? response.body : [];
        const milestones = raw.filter(isRecord).map(normalizeMilestone);
        return { ok: true as const, milestones };
      }
      if (response.status === 404) return upstream("Repository not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the list milestones request.");
    },

    async getMilestone(input: unknown) {
      const payload = validateGetMilestoneInput(input);
      const client = clientFor("milestones.get");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/milestones/${payload.milestoneNumber}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, milestone: normalizeMilestone(response.body) };
      }
      if (response.status === 404) return upstream("Milestone not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the get milestone request.");
    },

    async createMilestone(input: unknown) {
      const payload = validateCreateMilestoneInput(input);
      const client = clientFor("milestones.create");
      const body: Record<string, string> = { title: payload.title };
      if (payload.state !== undefined) body.state = payload.state;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.dueOn !== undefined) body.due_on = payload.dueOn;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, milestone: normalizeMilestone(response.body) };
      }
      if (response.status === 404) return upstream("Repository not found.");
      if (response.status === 422) return upstream("Milestone validation failed.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the create milestone request.");
    },

    async updateMilestone(input: unknown) {
      const payload = validateUpdateMilestoneInput(input);
      const client = clientFor("milestones.update");
      const body: Record<string, string | null> = {};
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.state !== undefined) body.state = payload.state;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.dueOn !== undefined) body.due_on = payload.dueOn;
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/milestones/${payload.milestoneNumber}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, milestone: normalizeMilestone(response.body) };
      }
      if (response.status === 404) return upstream("Milestone not found.");
      if (response.status === 422) return upstream("Milestone validation failed.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the update milestone request.");
    },

    async listCollaborators(input: unknown) {
      const payload = validateListCollaboratorsInput(input);
      const client = clientFor("repos.collaborators.list");
      const path =
        `/repos/${payload.owner}/${payload.repo}/collaborators` +
        qs({
          affiliation: payload.affiliation,
          permission: payload.permission,
          per_page: payload.perPage ? String(payload.perPage) : undefined,
          page: payload.page ? String(payload.page) : undefined,
        });
      const response = await client.fetchJSON(path);
      if (response.status === 200) {
        const raw = Array.isArray(response.body) ? response.body : [];
        const collaborators = raw.filter(isRecord).map(normalizeCollaborator);
        return { ok: true as const, collaborators };
      }
      if (response.status === 404) return upstream("Repository not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the list collaborators request.");
    },

    async addCollaborator(input: unknown) {
      const payload = validateAddCollaboratorInput(input);
      const client = clientFor("repos.collaborators.add");
      const body: Record<string, string> = {};
      if (payload.permission !== undefined) body.permission = payload.permission;
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/collaborators/${encodeURIComponent(payload.username)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      // 201 = invitation created; 204 = already a collaborator (idempotent success)
      if (response.status === 201 || response.status === 204) {
        return {
          ok: true as const,
          username: payload.username,
          invited: response.status === 201,
          alreadyCollaborator: response.status === 204,
        };
      }
      if (response.status === 404) return upstream("Repository or user not found.");
      if (response.status === 422) return upstream("Collaborator invitation validation failed.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the add collaborator request.");
    },

    async removeCollaborator(input: unknown) {
      const payload = validateRemoveCollaboratorInput(input);
      const client = clientFor("repos.collaborators.remove");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/collaborators/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, removed: true as const, username: payload.username };
      }
      if (response.status === 404) return upstream("Collaborator or repository not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the remove collaborator request.");
    },

    async checkCollaborator(input: unknown) {
      const payload = validateCheckCollaboratorInput(input);
      const client = clientFor("repos.collaborators.check");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/collaborators/${encodeURIComponent(payload.username)}`,
      );
      if (response.status === 204) {
        return { ok: true as const, isCollaborator: true as const, username: payload.username };
      }
      if (response.status === 404) {
        return { ok: true as const, isCollaborator: false as const, username: payload.username };
      }
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the check collaborator request.");
    },
  };
}
