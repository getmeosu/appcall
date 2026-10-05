/**
 * Ashby G5 — 4 agent-tool ops for sourcing projects.
 * All POST RPC against api.ashbyhq.com. Auth: tip createAuthClient.
 *
 * candidates.add_project    → POST /candidate.addProject   (write, omit)
 * candidates.list_projects  → POST /candidate.listProjects (read)
 * projects.list             → POST /project.list           (read)
 * projects.search           → POST /project.search         (read)
 *
 * Effect keys (/workspace/parity-briefs/ashby-g5-selflock.md):
 * - candidates.add_project omits: candidate.info has no projects field and
 *   candidate.listProjects is a paginated list, so there is no exact observe.
 * - reads omit; no Idempotent; no Reconcile in this card.
 *
 * Live shapes: addProject returns the Candidate object under `results`;
 * Project rows carry `title`, `isArchived`, `authorId`, `descriptionPlain`,
 * `descriptionHtml`, `confidential`, `customFieldEntries`. Rows are passed
 * through unchanged (no field renaming), so nothing is read from the wrong level.
 */
import { createAuthClient } from "./http";

export interface AshbyAuthInput {
  apiKey: string;
  fetch?: typeof fetch;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${field} is required`);
}

function compactBody(params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body[key] = value;
  }
  return body;
}

function asResults(raw: unknown): unknown {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return (raw as { results?: unknown }).results ?? null;
  }
  return null;
}

function resultsObject(raw: unknown, operation: string): Record<string, unknown> {
  const results = asResults(raw);
  if (results != null && typeof results === "object" && !Array.isArray(results)) {
    return results as Record<string, unknown>;
  }
  throw new Error(`Ashby ${operation} response missing results object`);
}

/** Project rows exactly as Ashby returns them; drops non-object entries only. */
function projectRows(raw: unknown): Record<string, unknown>[] {
  const results = asResults(raw);
  if (!Array.isArray(results)) return [];
  return results.filter(
    (row): row is Record<string, unknown> =>
      row != null && typeof row === "object" && !Array.isArray(row),
  );
}

function pageMeta(raw: unknown) {
  const data = (raw ?? {}) as {
    moreDataAvailable?: boolean;
    nextCursor?: string | null;
    syncToken?: string | null;
  };
  return {
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

function authClient(input: AshbyAuthInput, operation: string) {
  return createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation,
  });
}

// ---------------------------------------------------------------------------
// 1. candidates.add_project — POST /candidate.addProject · omit (no exact observe)
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesAddProjectInput extends AshbyAuthInput {
  candidateId: string;
  projectId: string;
}

export async function executeCandidatesAddProject(input: ExecuteCandidatesAddProjectInput) {
  const candidateId = requireNonEmptyString(input.candidateId, "candidateId");
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const client = authClient(input, "candidates.add_project");
  const raw = await client.postJSON("/candidate.addProject", { candidateId, projectId });
  return { candidate: resultsObject(raw, "candidates.add_project") };
}

// ---------------------------------------------------------------------------
// 2. candidates.list_projects — POST /candidate.listProjects
//    Request schema: candidateId*, cursor, limit (no syncToken; additionalProperties false).
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListProjectsInput extends AshbyAuthInput {
  candidateId: string;
  limit?: number;
  cursor?: string;
}

export async function executeCandidatesListProjects(input: ExecuteCandidatesListProjectsInput) {
  const candidateId = requireNonEmptyString(input.candidateId, "candidateId");
  const client = authClient(input, "candidates.list_projects");
  const raw = await client.postJSON(
    "/candidate.listProjects",
    compactBody({ candidateId, limit: input.limit, cursor: input.cursor }),
  );
  return { projects: projectRows(raw), ...pageMeta(raw) };
}

// ---------------------------------------------------------------------------
// 3. projects.list — POST /project.list
//    createdAfter is integer epoch milliseconds per the official schema.
// ---------------------------------------------------------------------------

export interface ExecuteProjectsListInput extends AshbyAuthInput {
  createdAfter?: number;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeProjectsList(input: ExecuteProjectsListInput) {
  if (input.createdAfter !== undefined && input.createdAfter !== null) {
    if (typeof input.createdAfter !== "number" || !Number.isInteger(input.createdAfter)) {
      throw new Error("createdAfter must be an integer (epoch milliseconds)");
    }
  }
  const client = authClient(input, "projects.list");
  const raw = await client.postJSON(
    "/project.list",
    compactBody({
      createdAfter: input.createdAfter,
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  return { projects: projectRows(raw), ...pageMeta(raw) };
}

// ---------------------------------------------------------------------------
// 4. projects.search — POST /project.search (≤100 results, no paging)
// ---------------------------------------------------------------------------

export interface ExecuteProjectsSearchInput extends AshbyAuthInput {
  title: string;
}

export async function executeProjectsSearch(input: ExecuteProjectsSearchInput) {
  const title = requireNonEmptyString(input.title, "title");
  const client = authClient(input, "projects.search");
  const raw = await client.postJSON("/project.search", { title });
  return { projects: projectRows(raw) };
}
