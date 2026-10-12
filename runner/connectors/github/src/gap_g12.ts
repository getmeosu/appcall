import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { requireSingleSegment as segment } from "./path_segment";

// G12: classic Projects + Classroom + team discussions (40 Composio-gap REST ops at 0.81.2).
// PRUNE-1 (0.82.0) removed the 15 Projects (classic) project/column ops: the REST API was
// sunset 2025-04-01 (https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/).
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
export type NormalizedCard = { id: number; note: string; columnUrl: string; archived: boolean };
export type NormalizedClassroom = { id: number; name: string; archived: boolean };
export type NormalizedAssignment = { id: number; title: string; slug: string };
export type NormalizedDiscussion = { id: number; number: number; title: string; body: string };

const PROJECT_ACCEPT = { Accept: "application/vnd.github.inertia+json" };

// ─── validators ──────────────────────────────────────────────────────────────

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

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
