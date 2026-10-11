import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G12: classic Projects + Classroom + team discussions (40 Composio-gap REST ops).
// All omit effectPolicy/reconcile/effect. GET/DELETE are body-less. JSON Content-Type only when a body is set.

type Page = { perPage?: number; page?: number };
type ProjectId = { projectId: number };
type ColumnId = { columnId: number };
type CardId = { cardId: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };

export type NormalizedProject = {
  id: number;
  name: string;
  body: string;
  state: string;
  number: number;
  htmlUrl: string;
};
export type NormalizedColumn = { id: number; name: string; projectUrl: string };
export type NormalizedCard = { id: number; note: string; columnUrl: string; archived: boolean };
export type NormalizedClassroom = { id: number; name: string; archived: boolean };
export type NormalizedAssignment = { id: number; title: string; slug: string };
export type NormalizedDiscussion = { id: number; number: number; title: string; body: string };

const PROJECT_ACCEPT = { Accept: "application/vnd.github.inertia+json" };

// ─── validators ──────────────────────────────────────────────────────────────

export function validateGetProjectInput(input: unknown): ProjectId {
  if (!isRecord(input)) throw new Error("projects.get input must be an object");
  return { projectId: requireId(input.projectId ?? input.project_id, "projectId") };
}

export function validateUpdateProjectInput(input: unknown): ProjectId & { name?: string; body?: string; state?: "open" | "closed" } {
  if (!isRecord(input)) throw new Error("projects.update input must be an object");
  const out: ProjectId & { name?: string; body?: string; state?: "open" | "closed" } = {
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
  };
  if (input.name !== undefined) out.name = requireNonEmpty(input.name, "name");
  if (input.body !== undefined) out.body = requireString(input.body, "body");
  if (input.state !== undefined) {
    if (input.state !== "open" && input.state !== "closed") throw new Error("state must be open or closed");
    out.state = input.state;
  }
  return out;
}

export function validateDeleteProjectInput(input: unknown): ProjectId {
  if (!isRecord(input)) throw new Error("projects.delete input must be an object");
  return { projectId: requireId(input.projectId ?? input.project_id, "projectId") };
}

export function validateListOrgClassicProjectsInput(input: unknown): OrgScope & Page & { state?: string } {
  if (!isRecord(input)) throw new Error("orgs.projects.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input), ...optionalState(input) };
}

export function validateCreateOrgProjectInput(input: unknown): OrgScope & { name: string; body?: string } {
  if (!isRecord(input)) throw new Error("orgs.projects.create input must be an object");
  return { org: segment(input.org, "org"), name: requireNonEmpty(input.name, "name"), ...optionalBody(input) };
}

export function validateListRepoProjectsInput(input: unknown): RepoScope & Page & { state?: string } {
  if (!isRecord(input)) throw new Error("repos.projects.list input must be an object");
  return { ...repo(input), ...page(input), ...optionalState(input) };
}

export function validateCreateRepoProjectInput(input: unknown): RepoScope & { name: string; body?: string } {
  if (!isRecord(input)) throw new Error("repos.projects.create input must be an object");
  return { ...repo(input), name: requireNonEmpty(input.name, "name"), ...optionalBody(input) };
}

export function validateListUserClassicProjectsInput(input: unknown): { username: string } & Page & { state?: string } {
  if (!isRecord(input)) throw new Error("users.projects.list input must be an object");
  return { username: segment(input.username, "username"), ...page(input), ...optionalState(input) };
}

export function validateCreateUserProjectInput(input: unknown): { name: string; body?: string } {
  if (!isRecord(input)) throw new Error("user.projects.create input must be an object");
  return { name: requireNonEmpty(input.name, "name"), ...optionalBody(input) };
}

export function validateListProjectColumnsInput(input: unknown): ProjectId & Page {
  if (!isRecord(input)) throw new Error("projects.columns.list input must be an object");
  return { projectId: requireId(input.projectId ?? input.project_id, "projectId"), ...page(input) };
}

export function validateCreateProjectColumnInput(input: unknown): ProjectId & { name: string } {
  if (!isRecord(input)) throw new Error("projects.columns.create input must be an object");
  return { projectId: requireId(input.projectId ?? input.project_id, "projectId"), name: requireNonEmpty(input.name, "name") };
}

export function validateGetProjectColumnInput(input: unknown): ColumnId {
  if (!isRecord(input)) throw new Error("projects.columns.get input must be an object");
  return { columnId: requireId(input.columnId ?? input.column_id, "columnId") };
}

export function validateUpdateProjectColumnInput(input: unknown): ColumnId & { name: string } {
  if (!isRecord(input)) throw new Error("projects.columns.update input must be an object");
  return { columnId: requireId(input.columnId ?? input.column_id, "columnId"), name: requireNonEmpty(input.name, "name") };
}

export function validateDeleteProjectColumnInput(input: unknown): ColumnId {
  if (!isRecord(input)) throw new Error("projects.columns.delete input must be an object");
  return { columnId: requireId(input.columnId ?? input.column_id, "columnId") };
}

export function validateMoveProjectColumnInput(input: unknown): ColumnId & { position: string } {
  if (!isRecord(input)) throw new Error("projects.columns.move input must be an object");
  return {
    columnId: requireId(input.columnId ?? input.column_id, "columnId"),
    position: requireNonEmpty(input.position, "position"),
  };
}

export function validateListProjectCardsInput(input: unknown): ColumnId & Page & { archivedState?: string } {
  if (!isRecord(input)) throw new Error("projects.cards.list input must be an object");
  const out: ColumnId & Page & { archivedState?: string } = {
    columnId: requireId(input.columnId ?? input.column_id, "columnId"),
    ...page(input),
  };
  const archived = input.archivedState ?? input.archived_state;
  if (archived !== undefined) out.archivedState = requireNonEmpty(archived, "archivedState");
  return out;
}

export function validateCreateProjectCardInput(input: unknown): ColumnId & {
  note?: string;
  contentId?: number;
  contentType?: string;
} {
  if (!isRecord(input)) throw new Error("projects.cards.create input must be an object");
  const note = input.note;
  const contentId = input.contentId ?? input.content_id;
  const contentType = input.contentType ?? input.content_type;
  const hasNote = note !== undefined;
  const hasContent = contentId !== undefined || contentType !== undefined;
  if (hasNote === hasContent) throw new Error("provide either note or contentId+contentType");
  if (hasNote) {
    return { columnId: requireId(input.columnId ?? input.column_id, "columnId"), note: requireString(note, "note") };
  }
  return {
    columnId: requireId(input.columnId ?? input.column_id, "columnId"),
    contentId: requireId(contentId, "contentId"),
    contentType: requireNonEmpty(contentType, "contentType"),
  };
}

export function validateGetProjectCardInput(input: unknown): CardId {
  if (!isRecord(input)) throw new Error("projects.cards.get input must be an object");
  return { cardId: requireId(input.cardId ?? input.card_id, "cardId") };
}

export function validateUpdateProjectCardInput(input: unknown): CardId & { note?: string; archived?: boolean } {
  if (!isRecord(input)) throw new Error("projects.cards.update input must be an object");
  const out: CardId & { note?: string; archived?: boolean } = {
    cardId: requireId(input.cardId ?? input.card_id, "cardId"),
  };
  if (input.note !== undefined) out.note = requireString(input.note, "note");
  if (input.archived !== undefined) {
    if (typeof input.archived !== "boolean") throw new Error("archived must be a boolean");
    out.archived = input.archived;
  }
  return out;
}

export function validateDeleteProjectCardInput(input: unknown): CardId {
  if (!isRecord(input)) throw new Error("projects.cards.delete input must be an object");
  return { cardId: requireId(input.cardId ?? input.card_id, "cardId") };
}

export function validateMoveProjectCardInput(input: unknown): CardId & { position: string; columnId?: number } {
  if (!isRecord(input)) throw new Error("projects.cards.move input must be an object");
  const out: CardId & { position: string; columnId?: number } = {
    cardId: requireId(input.cardId ?? input.card_id, "cardId"),
    position: requireNonEmpty(input.position, "position"),
  };
  if (input.columnId !== undefined || input.column_id !== undefined) {
    out.columnId = requireId(input.columnId ?? input.column_id, "columnId");
  }
  return out;
}

export function validateListProjectCollaboratorsInput(input: unknown): ProjectId & Page & { affiliation?: string } {
  if (!isRecord(input)) throw new Error("projects.collaborators.list input must be an object");
  const out: ProjectId & Page & { affiliation?: string } = {
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
    ...page(input),
  };
  if (input.affiliation !== undefined) out.affiliation = requireNonEmpty(input.affiliation, "affiliation");
  return out;
}

export function validateAddProjectCollaboratorInput(input: unknown): ProjectId & { username: string; permission?: string } {
  if (!isRecord(input)) throw new Error("projects.collaborators.add input must be an object");
  const out: ProjectId & { username: string; permission?: string } = {
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
    username: segment(input.username, "username"),
  };
  if (input.permission !== undefined) out.permission = requireNonEmpty(input.permission, "permission");
  return out;
}

export function validateRemoveProjectCollaboratorInput(input: unknown): ProjectId & { username: string } {
  if (!isRecord(input)) throw new Error("projects.collaborators.remove input must be an object");
  return {
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
    username: segment(input.username, "username"),
  };
}

export function validateGetProjectCollaboratorPermissionInput(input: unknown): ProjectId & { username: string } {
  if (!isRecord(input)) throw new Error("projects.collaborators.permission.get input must be an object");
  return {
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
    username: segment(input.username, "username"),
  };
}

export function validateListTeamProjectsInput(input: unknown): OrgScope & { teamSlug: string } & Page {
  if (!isRecord(input)) throw new Error("orgs.teams.projects.list input must be an object");
  return { org: segment(input.org, "org"), teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"), ...page(input) };
}

export function validateAddTeamProjectInput(input: unknown): OrgScope & { teamSlug: string; projectId: number; permission?: string } {
  if (!isRecord(input)) throw new Error("orgs.teams.projects.add input must be an object");
  const out: OrgScope & { teamSlug: string; projectId: number; permission?: string } = {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
  };
  if (input.permission !== undefined) out.permission = requireNonEmpty(input.permission, "permission");
  return out;
}

export function validateRemoveTeamProjectInput(input: unknown): OrgScope & { teamSlug: string; projectId: number } {
  if (!isRecord(input)) throw new Error("orgs.teams.projects.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
  };
}

export function validateGetTeamProjectPermissionInput(input: unknown): OrgScope & { teamSlug: string; projectId: number } {
  if (!isRecord(input)) throw new Error("orgs.teams.projects.permission.get input must be an object");
  return {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    projectId: requireId(input.projectId ?? input.project_id, "projectId"),
  };
}

export function validateListClassroomsInput(input: unknown): Page {
  if (!isRecord(input)) throw new Error("classrooms.list input must be an object");
  return page(input);
}

export function validateGetClassroomInput(input: unknown): { classroomId: number } {
  if (!isRecord(input)) throw new Error("classrooms.get input must be an object");
  return { classroomId: requireId(input.classroomId ?? input.classroom_id, "classroomId") };
}

export function validateListClassroomAssignmentsInput(input: unknown): { classroomId: number } & Page {
  if (!isRecord(input)) throw new Error("classrooms.assignments.list input must be an object");
  return { classroomId: requireId(input.classroomId ?? input.classroom_id, "classroomId"), ...page(input) };
}

export function validateGetAssignmentInput(input: unknown): { assignmentId: number } {
  if (!isRecord(input)) throw new Error("assignments.get input must be an object");
  return { assignmentId: requireId(input.assignmentId ?? input.assignment_id, "assignmentId") };
}

export function validateListAssignmentGradesInput(input: unknown): { assignmentId: number } {
  if (!isRecord(input)) throw new Error("assignments.grades.list input must be an object");
  return { assignmentId: requireId(input.assignmentId ?? input.assignment_id, "assignmentId") };
}

export function validateListAcceptedAssignmentsInput(input: unknown): { assignmentId: number } & Page {
  if (!isRecord(input)) throw new Error("assignments.accepted.list input must be an object");
  return { assignmentId: requireId(input.assignmentId ?? input.assignment_id, "assignmentId"), ...page(input) };
}

export function validateListTeamDiscussionsInput(input: unknown): OrgScope & { teamSlug: string } & Page {
  if (!isRecord(input)) throw new Error("teams.discussions.list input must be an object");
  return { org: segment(input.org, "org"), teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"), ...page(input) };
}

export function validateGetTeamDiscussionInput(input: unknown): OrgScope & { teamSlug: string; discussionNumber: number } {
  if (!isRecord(input)) throw new Error("teams.discussions.get input must be an object");
  return {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    discussionNumber: requireId(input.discussionNumber ?? input.discussion_number, "discussionNumber"),
  };
}

export function validateCreateTeamDiscussionInput(input: unknown): OrgScope & { teamSlug: string; title: string; body: string; private?: boolean } {
  if (!isRecord(input)) throw new Error("teams.discussions.create input must be an object");
  const out: OrgScope & { teamSlug: string; title: string; body: string; private?: boolean } = {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    title: requireNonEmpty(input.title, "title"),
    body: requireString(input.body, "body"),
  };
  if (input.private !== undefined) {
    if (typeof input.private !== "boolean") throw new Error("private must be a boolean");
    out.private = input.private;
  }
  return out;
}

export function validateUpdateTeamDiscussionInput(input: unknown): OrgScope & {
  teamSlug: string;
  discussionNumber: number;
  title?: string;
  body?: string;
} {
  if (!isRecord(input)) throw new Error("teams.discussions.update input must be an object");
  const out: OrgScope & { teamSlug: string; discussionNumber: number; title?: string; body?: string } = {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    discussionNumber: requireId(input.discussionNumber ?? input.discussion_number, "discussionNumber"),
  };
  if (input.title !== undefined) out.title = requireNonEmpty(input.title, "title");
  if (input.body !== undefined) out.body = requireString(input.body, "body");
  return out;
}

export function validateDeleteTeamDiscussionInput(input: unknown): OrgScope & { teamSlug: string; discussionNumber: number } {
  if (!isRecord(input)) throw new Error("teams.discussions.delete input must be an object");
  return {
    org: segment(input.org, "org"),
    teamSlug: segment(input.teamSlug ?? input.team_slug, "teamSlug"),
    discussionNumber: requireId(input.discussionNumber ?? input.discussion_number, "discussionNumber"),
  };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG12Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getProject(input: unknown) {
      const payload = validateGetProjectInput(input);
      return readObject(clientFor("projects.get"), `/projects/${payload.projectId}`, "projects.get", normalizeProject, PROJECT_ACCEPT);
    },
    async updateProject(input: unknown) {
      const payload = validateUpdateProjectInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.body !== undefined) body.body = payload.body;
      if (payload.state !== undefined) body.state = payload.state;
      return writeObject(
        clientFor("projects.update"),
        `/projects/${payload.projectId}`,
        jsonInit("PATCH", body, PROJECT_ACCEPT),
        "projects.update",
        normalizeProject,
        [200],
      );
    },
    async deleteProject(input: unknown) {
      const payload = validateDeleteProjectInput(input);
      return empty(
        clientFor("projects.delete"),
        `/projects/${payload.projectId}`,
        { method: "DELETE", headers: PROJECT_ACCEPT },
        204,
        { deleted: true, projectId: payload.projectId },
        "projects.delete",
      );
    },
    async listOrgClassicProjects(input: unknown) {
      const payload = validateListOrgClassicProjectsInput(input);
      return readList(
        clientFor("orgs.projects.list"),
        `/orgs/${enc(payload.org)}/projects${qs({ ...pageParams(payload), ...stateParam(payload) })}`,
        "orgs.projects.list",
        normalizeProject,
        PROJECT_ACCEPT,
      );
    },
    async createOrgProject(input: unknown) {
      const payload = validateCreateOrgProjectInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.body !== undefined) body.body = payload.body;
      return writeObject(
        clientFor("orgs.projects.create"),
        `/orgs/${enc(payload.org)}/projects`,
        jsonInit("POST", body, PROJECT_ACCEPT),
        "orgs.projects.create",
        normalizeProject,
        [201],
      );
    },
    async listRepoProjects(input: unknown) {
      const payload = validateListRepoProjectsInput(input);
      return readList(
        clientFor("repos.projects.list"),
        `${repoPath(payload)}/projects${qs({ ...pageParams(payload), ...stateParam(payload) })}`,
        "repos.projects.list",
        normalizeProject,
        PROJECT_ACCEPT,
      );
    },
    async createRepoProject(input: unknown) {
      const payload = validateCreateRepoProjectInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.body !== undefined) body.body = payload.body;
      return writeObject(
        clientFor("repos.projects.create"),
        `${repoPath(payload)}/projects`,
        jsonInit("POST", body, PROJECT_ACCEPT),
        "repos.projects.create",
        normalizeProject,
        [201],
      );
    },
    async listUserClassicProjects(input: unknown) {
      const payload = validateListUserClassicProjectsInput(input);
      return readList(
        clientFor("users.projects.list"),
        `/users/${enc(payload.username)}/projects${qs({ ...pageParams(payload), ...stateParam(payload) })}`,
        "users.projects.list",
        normalizeProject,
        PROJECT_ACCEPT,
      );
    },
    async createUserProject(input: unknown) {
      const payload = validateCreateUserProjectInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.body !== undefined) body.body = payload.body;
      return writeObject(
        clientFor("user.projects.create"),
        "/user/projects",
        jsonInit("POST", body, PROJECT_ACCEPT),
        "user.projects.create",
        normalizeProject,
        [201],
      );
    },
    async listProjectColumns(input: unknown) {
      const payload = validateListProjectColumnsInput(input);
      return readList(
        clientFor("projects.columns.list"),
        `/projects/${payload.projectId}/columns${qs(pageParams(payload))}`,
        "projects.columns.list",
        normalizeColumn,
        PROJECT_ACCEPT,
      );
    },
    async createProjectColumn(input: unknown) {
      const payload = validateCreateProjectColumnInput(input);
      return writeObject(
        clientFor("projects.columns.create"),
        `/projects/${payload.projectId}/columns`,
        jsonInit("POST", { name: payload.name }, PROJECT_ACCEPT),
        "projects.columns.create",
        normalizeColumn,
        [201],
      );
    },
    async getProjectColumn(input: unknown) {
      const payload = validateGetProjectColumnInput(input);
      return readObject(
        clientFor("projects.columns.get"),
        `/projects/columns/${payload.columnId}`,
        "projects.columns.get",
        normalizeColumn,
        PROJECT_ACCEPT,
      );
    },
    async updateProjectColumn(input: unknown) {
      const payload = validateUpdateProjectColumnInput(input);
      return writeObject(
        clientFor("projects.columns.update"),
        `/projects/columns/${payload.columnId}`,
        jsonInit("PATCH", { name: payload.name }, PROJECT_ACCEPT),
        "projects.columns.update",
        normalizeColumn,
        [200],
      );
    },
    async deleteProjectColumn(input: unknown) {
      const payload = validateDeleteProjectColumnInput(input);
      return empty(
        clientFor("projects.columns.delete"),
        `/projects/columns/${payload.columnId}`,
        { method: "DELETE", headers: PROJECT_ACCEPT },
        204,
        { deleted: true, columnId: payload.columnId },
        "projects.columns.delete",
      );
    },
    async moveProjectColumn(input: unknown) {
      const payload = validateMoveProjectColumnInput(input);
      return empty(
        clientFor("projects.columns.move"),
        `/projects/columns/${payload.columnId}/moves`,
        jsonInit("POST", { position: payload.position }, PROJECT_ACCEPT),
        201,
        { moved: true, columnId: payload.columnId, position: payload.position },
        "projects.columns.move",
      );
    },
    async listProjectCards(input: unknown) {
      const payload = validateListProjectCardsInput(input);
      const params = pageParams(payload);
      if (payload.archivedState) params.archived_state = payload.archivedState;
      return readList(
        clientFor("projects.cards.list"),
        `/projects/columns/${payload.columnId}/cards${qs(params)}`,
        "projects.cards.list",
        normalizeCard,
        PROJECT_ACCEPT,
      );
    },
    async createProjectCard(input: unknown) {
      const payload = validateCreateProjectCardInput(input);
      const body: Record<string, unknown> = payload.note !== undefined
        ? { note: payload.note }
        : { content_id: payload.contentId, content_type: payload.contentType };
      return writeObject(
        clientFor("projects.cards.create"),
        `/projects/columns/${payload.columnId}/cards`,
        jsonInit("POST", body, PROJECT_ACCEPT),
        "projects.cards.create",
        normalizeCard,
        [201],
      );
    },
    async getProjectCard(input: unknown) {
      const payload = validateGetProjectCardInput(input);
      return readObject(
        clientFor("projects.cards.get"),
        `/projects/columns/cards/${payload.cardId}`,
        "projects.cards.get",
        normalizeCard,
        PROJECT_ACCEPT,
      );
    },
    async updateProjectCard(input: unknown) {
      const payload = validateUpdateProjectCardInput(input);
      const body: Record<string, unknown> = {};
      if (payload.note !== undefined) body.note = payload.note;
      if (payload.archived !== undefined) body.archived = payload.archived;
      return writeObject(
        clientFor("projects.cards.update"),
        `/projects/columns/cards/${payload.cardId}`,
        jsonInit("PATCH", body, PROJECT_ACCEPT),
        "projects.cards.update",
        normalizeCard,
        [200],
      );
    },
    async deleteProjectCard(input: unknown) {
      const payload = validateDeleteProjectCardInput(input);
      return empty(
        clientFor("projects.cards.delete"),
        `/projects/columns/cards/${payload.cardId}`,
        { method: "DELETE", headers: PROJECT_ACCEPT },
        204,
        { deleted: true, cardId: payload.cardId },
        "projects.cards.delete",
      );
    },
    async moveProjectCard(input: unknown) {
      const payload = validateMoveProjectCardInput(input);
      const body: Record<string, unknown> = { position: payload.position };
      if (payload.columnId !== undefined) body.column_id = payload.columnId;
      return empty(
        clientFor("projects.cards.move"),
        `/projects/columns/cards/${payload.cardId}/moves`,
        jsonInit("POST", body, PROJECT_ACCEPT),
        201,
        { moved: true, cardId: payload.cardId, position: payload.position, columnId: payload.columnId },
        "projects.cards.move",
      );
    },
    async listProjectCollaborators(input: unknown) {
      const payload = validateListProjectCollaboratorsInput(input);
      const params = pageParams(payload);
      if (payload.affiliation) params.affiliation = payload.affiliation;
      return readList(
        clientFor("projects.collaborators.list"),
        `/projects/${payload.projectId}/collaborators${qs(params)}`,
        "projects.collaborators.list",
        normalizeCollaborator,
        PROJECT_ACCEPT,
      );
    },
    async addProjectCollaborator(input: unknown) {
      const payload = validateAddProjectCollaboratorInput(input);
      const init = payload.permission
        ? jsonInit("PUT", { permission: payload.permission }, PROJECT_ACCEPT)
        : { method: "PUT" as const, headers: PROJECT_ACCEPT };
      return empty(
        clientFor("projects.collaborators.add"),
        `/projects/${payload.projectId}/collaborators/${enc(payload.username)}`,
        init,
        204,
        { added: true, projectId: payload.projectId, username: payload.username, permission: payload.permission },
        "projects.collaborators.add",
      );
    },
    async removeProjectCollaborator(input: unknown) {
      const payload = validateRemoveProjectCollaboratorInput(input);
      return empty(
        clientFor("projects.collaborators.remove"),
        `/projects/${payload.projectId}/collaborators/${enc(payload.username)}`,
        { method: "DELETE", headers: PROJECT_ACCEPT },
        204,
        { removed: true, projectId: payload.projectId, username: payload.username },
        "projects.collaborators.remove",
      );
    },
    async getProjectCollaboratorPermission(input: unknown) {
      const payload = validateGetProjectCollaboratorPermissionInput(input);
      const result = await readRaw(
        clientFor("projects.collaborators.permission.get"),
        `/projects/${payload.projectId}/collaborators/${enc(payload.username)}/permission`,
        "projects.collaborators.permission.get",
        PROJECT_ACCEPT,
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the projects.collaborators.permission.get request.");
      const permission = typeof result.body.permission === "string" ? result.body.permission : "";
      return { ok: true as const, permission, username: payload.username, projectId: payload.projectId };
    },
    async listTeamProjects(input: unknown) {
      const payload = validateListTeamProjectsInput(input);
      return readList(
        clientFor("orgs.teams.projects.list"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/projects${qs(pageParams(payload))}`,
        "orgs.teams.projects.list",
        normalizeProject,
        PROJECT_ACCEPT,
      );
    },
    async addTeamProject(input: unknown) {
      const payload = validateAddTeamProjectInput(input);
      const init = payload.permission
        ? jsonInit("PUT", { permission: payload.permission }, PROJECT_ACCEPT)
        : { method: "PUT" as const, headers: PROJECT_ACCEPT };
      return empty(
        clientFor("orgs.teams.projects.add"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/projects/${payload.projectId}`,
        init,
        204,
        {
          added: true,
          org: payload.org,
          teamSlug: payload.teamSlug,
          projectId: payload.projectId,
          permission: payload.permission,
        },
        "orgs.teams.projects.add",
      );
    },
    async removeTeamProject(input: unknown) {
      const payload = validateRemoveTeamProjectInput(input);
      return empty(
        clientFor("orgs.teams.projects.remove"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/projects/${payload.projectId}`,
        { method: "DELETE", headers: PROJECT_ACCEPT },
        204,
        { removed: true, org: payload.org, teamSlug: payload.teamSlug, projectId: payload.projectId },
        "orgs.teams.projects.remove",
      );
    },
    async getTeamProjectPermission(input: unknown) {
      const payload = validateGetTeamProjectPermissionInput(input);
      const result = await readRaw(
        clientFor("orgs.teams.projects.permission.get"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/projects/${payload.projectId}`,
        "orgs.teams.projects.permission.get",
        PROJECT_ACCEPT,
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.teams.projects.permission.get request.");
      return {
        ok: true as const,
        permission: result.body.permission === true || result.body.permission === "true" ? "read" : String(result.body.permission ?? ""),
        state: typeof result.body.state === "string" ? result.body.state : "",
        org: payload.org,
        teamSlug: payload.teamSlug,
        projectId: payload.projectId,
      };
    },
    async listClassrooms(input: unknown) {
      const payload = validateListClassroomsInput(input);
      return readList(clientFor("classrooms.list"), `/classrooms${qs(pageParams(payload))}`, "classrooms.list", normalizeClassroom);
    },
    async getClassroom(input: unknown) {
      const payload = validateGetClassroomInput(input);
      return readObject(clientFor("classrooms.get"), `/classrooms/${payload.classroomId}`, "classrooms.get", normalizeClassroom);
    },
    async listClassroomAssignments(input: unknown) {
      const payload = validateListClassroomAssignmentsInput(input);
      return readList(
        clientFor("classrooms.assignments.list"),
        `/classrooms/${payload.classroomId}/assignments${qs(pageParams(payload))}`,
        "classrooms.assignments.list",
        normalizeAssignment,
      );
    },
    async getAssignment(input: unknown) {
      const payload = validateGetAssignmentInput(input);
      return readObject(clientFor("assignments.get"), `/assignments/${payload.assignmentId}`, "assignments.get", normalizeAssignment);
    },
    async listAssignmentGrades(input: unknown) {
      const payload = validateListAssignmentGradesInput(input);
      return readList(
        clientFor("assignments.grades.list"),
        `/assignments/${payload.assignmentId}/grades`,
        "assignments.grades.list",
        normalizeGrade,
      );
    },
    async listAcceptedAssignments(input: unknown) {
      const payload = validateListAcceptedAssignmentsInput(input);
      return readList(
        clientFor("assignments.accepted.list"),
        `/assignments/${payload.assignmentId}/accepted_assignments${qs(pageParams(payload))}`,
        "assignments.accepted.list",
        normalizeAccepted,
      );
    },
    async listTeamDiscussions(input: unknown) {
      const payload = validateListTeamDiscussionsInput(input);
      return readList(
        clientFor("teams.discussions.list"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/discussions${qs(pageParams(payload))}`,
        "teams.discussions.list",
        normalizeDiscussion,
      );
    },
    async getTeamDiscussion(input: unknown) {
      const payload = validateGetTeamDiscussionInput(input);
      return readObject(
        clientFor("teams.discussions.get"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/discussions/${payload.discussionNumber}`,
        "teams.discussions.get",
        normalizeDiscussion,
      );
    },
    async createTeamDiscussion(input: unknown) {
      const payload = validateCreateTeamDiscussionInput(input);
      const body: Record<string, unknown> = { title: payload.title, body: payload.body };
      if (payload.private !== undefined) body.private = payload.private;
      return writeObject(
        clientFor("teams.discussions.create"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/discussions`,
        jsonInit("POST", body),
        "teams.discussions.create",
        normalizeDiscussion,
        [201],
      );
    },
    async updateTeamDiscussion(input: unknown) {
      const payload = validateUpdateTeamDiscussionInput(input);
      const body: Record<string, unknown> = {};
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.body !== undefined) body.body = payload.body;
      return writeObject(
        clientFor("teams.discussions.update"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/discussions/${payload.discussionNumber}`,
        jsonInit("PATCH", body),
        "teams.discussions.update",
        normalizeDiscussion,
        [200],
      );
    },
    async deleteTeamDiscussion(input: unknown) {
      const payload = validateDeleteTeamDiscussionInput(input);
      return empty(
        clientFor("teams.discussions.delete"),
        `/orgs/${enc(payload.org)}/teams/${enc(payload.teamSlug)}/discussions/${payload.discussionNumber}`,
        { method: "DELETE" },
        204,
        {
          deleted: true,
          org: payload.org,
          teamSlug: payload.teamSlug,
          discussionNumber: payload.discussionNumber,
        },
        "teams.discussions.delete",
      );
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizeProject(item: Record<string, unknown>): NormalizedProject {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    body: typeof item.body === "string" ? item.body : "",
    state: typeof item.state === "string" ? item.state : "",
    number: typeof item.number === "number" ? item.number : 0,
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
  };
}

function normalizeColumn(item: Record<string, unknown>): NormalizedColumn {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    projectUrl: typeof item.project_url === "string" ? item.project_url : "",
  };
}

function normalizeCard(item: Record<string, unknown>): NormalizedCard {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    note: typeof item.note === "string" ? item.note : "",
    columnUrl: typeof item.column_url === "string" ? item.column_url : "",
    archived: item.archived === true,
  };
}

function normalizeCollaborator(item: Record<string, unknown>): { login: string; id: number } {
  return {
    login: typeof item.login === "string" ? item.login : "",
    id: typeof item.id === "number" ? item.id : 0,
  };
}

function normalizeClassroom(item: Record<string, unknown>): NormalizedClassroom {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    archived: item.archived === true,
  };
}

function normalizeAssignment(item: Record<string, unknown>): NormalizedAssignment {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    title: typeof item.title === "string" ? item.title : "",
    slug: typeof item.slug === "string" ? item.slug : "",
  };
}

function normalizeGrade(item: Record<string, unknown>): { assignmentName: string; starterCodeUrl: string; githubUsername: string; pointsAwarded: number; pointsAvailable: number } {
  return {
    assignmentName: typeof item.assignment_name === "string" ? item.assignment_name : "",
    starterCodeUrl: typeof item.starter_code_url === "string" ? item.starter_code_url : "",
    githubUsername: typeof item.github_username === "string" ? item.github_username : "",
    pointsAwarded: typeof item.points_awarded === "number" ? item.points_awarded : 0,
    pointsAvailable: typeof item.points_available === "number" ? item.points_available : 0,
  };
}

function normalizeAccepted(item: Record<string, unknown>): { id: number; submitted: boolean } {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    submitted: item.submitted === true,
  };
}

function normalizeDiscussion(item: Record<string, unknown>): NormalizedDiscussion {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    body: typeof item.body === "string" ? item.body : "",
  };
}

// ─── http helpers ────────────────────────────────────────────────────────────

async function readRaw(client: GitHubClient, path: string, operation: string, extraHeaders?: Record<string, string>) {
  const response = await client.fetchJSON(path, extraHeaders ? { headers: extraHeaders } : {});
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(`GitHub ${operation} resource was not found.`);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

async function readObject<T>(
  client: GitHubClient,
  path: string,
  operation: string,
  normalize: (item: Record<string, unknown>) => T,
  extraHeaders?: Record<string, string>,
) {
  const result = await readRaw(client, path, operation, extraHeaders);
  if (!result.ok) return result;
  if (!isRecord(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return { ok: true as const, item: normalize(result.body) };
}

async function readList<T>(
  client: GitHubClient,
  path: string,
  operation: string,
  normalize: (item: Record<string, unknown>) => T,
  extraHeaders?: Record<string, string>,
) {
  const result = await readRaw(client, path, operation, extraHeaders);
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  const items = result.body.filter(isRecord).map(normalize);
  return { ok: true as const, items };
}

async function writeObject<T>(
  client: GitHubClient,
  path: string,
  init: RequestInit,
  operation: string,
  normalize: (item: Record<string, unknown>) => T,
  success: number[],
) {
  const response = await client.fetchJSON(path, init);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(`GitHub ${operation} resource was not found.`);
  if (!success.includes(response.status)) return upstream(`GitHub rejected the ${operation} request.`);
  if (!isRecord(response.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return { ok: true as const, item: normalize(response.body), status: response.status };
}

async function empty(
  client: GitHubClient,
  path: string,
  init: RequestInit,
  success: number,
  value: Record<string, unknown>,
  operation: string,
) {
  const response = await client.fetchJSON(path, init);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(`GitHub ${operation} resource was not found.`);
  return upstream(`GitHub rejected the ${operation} request.`);
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

function jsonInit(method: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function page(input: Record<string, unknown>): Page {
  const out: Page = {};
  if (input.perPage !== undefined || input.per_page !== undefined) {
    out.perPage = requireId(input.perPage ?? input.per_page, "perPage");
  }
  if (input.page !== undefined) out.page = requireId(input.page, "page");
  return out;
}

function pageParams(payload: Page): Record<string, string> {
  const params: Record<string, string> = {};
  if (payload.perPage !== undefined) params.per_page = String(Math.min(payload.perPage, 100));
  if (payload.page !== undefined) params.page = String(payload.page);
  return params;
}

function optionalState(input: Record<string, unknown>): { state?: string } {
  if (input.state === undefined) return {};
  const state = requireNonEmpty(input.state, "state");
  if (state !== "open" && state !== "closed" && state !== "all") throw new Error("state must be open, closed, or all");
  return { state };
}

function stateParam(payload: { state?: string }): Record<string, string> {
  return payload.state ? { state: payload.state } : {};
}

function optionalBody(input: Record<string, unknown>): { body?: string } {
  if (input.body === undefined) return {};
  return { body: requireString(input.body, "body") };
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, value]) => value.length > 0);
  if (entries.length === 0) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${enc(payload.owner)}/${enc(payload.repo)}`;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
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
