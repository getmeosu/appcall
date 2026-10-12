import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { requireSingleSegment as segment } from "./path_segment";

// G12: Classroom + team discussions (originally 40 Composio-gap REST ops incl. classic Projects).
// PRUNE-1 (0.82.0) removed the 15 Projects (classic) project/column ops and PRUNE-2 (0.83.0) the
// remaining 14 classic card/collaborator/team-project ops: the Projects (classic) REST API was sunset
// 2025-04-01 (https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/). 11 ops remain.
// All omit effectPolicy/reconcile/effect. GET/DELETE are body-less. JSON Content-Type only when a body is set.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };

export type NormalizedClassroom = { id: number; name: string; archived: boolean };
export type NormalizedAssignment = { id: number; title: string; slug: string };
export type NormalizedDiscussion = { id: number; number: number; title: string; body: string };

// ─── validators ──────────────────────────────────────────────────────────────

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
