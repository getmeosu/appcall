import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };
type GistId = { gistId: string };
type GistComment = GistId & { commentId: number };
type GistRevision = GistId & { sha: string };
type UserGists = { username: string } & Page;
type Repo = { owner: string; repo: string };
type IssueAssignee = Repo & { issueNumber: number; assignee: string };
type IssueEvent = Repo & { eventId: number };
type MilestoneLabels = Repo & { milestoneNumber: number };

export type NormalizedGist = { id: string; description: string; public: boolean; owner: string };
export type NormalizedGistComment = { id: number; body: string; user: string; createdAt: string };
export type NormalizedGistCommit = { sha: string; user: string; committedAt: string };
export type NormalizedIssue = { number: number; title: string; state: string };
export type NormalizedIssueComment = { id: number; body: string; user: string; createdAt: string };
export type NormalizedIssueEvent = { id: number; event: string; actor: string; createdAt: string };
export type NormalizedLabel = { name: string; color: string; description: string };

export function validateCheckGistStarInput(input: unknown): GistId {
  const record = requireObject(input, "gists.star.check");
  return { gistId: requireSingleSegment(record.gistId ?? record.gist_id, "gist_id") };
}

export function validateGetGistCommentInput(input: unknown): GistComment {
  const record = requireObject(input, "gists.comments.get");
  return { ...gistId(record), commentId: requireId(record.commentId ?? record.comment_id, "comment_id") };
}

export function validateGetGistRevisionInput(input: unknown): GistRevision {
  const record = requireObject(input, "gists.revision.get");
  return { ...gistId(record), sha: requireSingleSegment(record.sha, "sha") };
}

export function validateListUserGistsInput(input: unknown): UserGists {
  const record = requireObject(input, "users.gists.list");
  return { username: requireSingleSegment(record.username, "username"), ...pageOf(record) };
}

export function validateListGistCommentsInput(input: unknown): GistId & Page {
  const record = requireObject(input, "gists.comments.list");
  return { ...gistId(record), ...pageOf(record) };
}

export function validateListGistCommitsInput(input: unknown): GistId & Page {
  const record = requireObject(input, "gists.commits.list");
  return { ...gistId(record), ...pageOf(record) };
}

export function validateListGistForksInput(input: unknown): GistId & Page {
  const record = requireObject(input, "gists.forks.list");
  return { ...gistId(record), ...pageOf(record) };
}

export function validateListPublicGistsInput(input: unknown): Page {
  if (input === undefined || input === null) return {};
  const record = requireObject(input, "gists.public.list");
  return pageOf(record);
}

export function validateListStarredGistsInput(input: unknown): Page {
  if (input === undefined || input === null) return {};
  const record = requireObject(input, "gists.starred.list");
  return pageOf(record);
}

export function validateCheckIssueAssigneeInput(input: unknown): IssueAssignee {
  const record = requireObject(input, "issues.assignees.check");
  return {
    ...repo(record),
    issueNumber: requireId(record.issueNumber ?? record.issue_number, "issue_number"),
    assignee: requireSingleSegment(record.assignee, "assignee"),
  };
}

export function validateGetIssueEventInput(input: unknown): IssueEvent {
  const record = requireObject(input, "issues.events.get");
  return { ...repo(record), eventId: requireId(record.eventId ?? record.event_id, "event_id") };
}

export function validateListAssignedIssuesInput(input: unknown): Page {
  if (input === undefined || input === null) return {};
  const record = requireObject(input, "issues.assigned.list");
  return pageOf(record);
}

export function validateListRepoIssueCommentsInput(input: unknown): Repo & Page {
  const record = requireObject(input, "repos.issues.comments.list");
  return { ...repo(record), ...pageOf(record) };
}

export function validateListRepoIssueEventsInput(input: unknown): Repo & Page {
  const record = requireObject(input, "repos.issues.events.list");
  return { ...repo(record), ...pageOf(record) };
}

export function validateListMilestoneLabelsInput(input: unknown): MilestoneLabels & Page {
  const record = requireObject(input, "milestones.labels.list");
  return { ...repo(record), milestoneNumber: requireId(record.milestoneNumber ?? record.milestone_number, "milestone_number"), ...pageOf(record) };
}

export function createCard12ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "gists.star.check",
  });

  return {
    async checkGistStar(input: unknown) {
      const payload = validateCheckGistStarInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/star`);
      // Docs: 204 if starred, 404 if not starred. Neither is an error.
      if (response.status === 204) return { ok: true as const, starred: true as const };
      if (response.status === 404) return { ok: true as const, starred: false as const };
      return mapRateOrUpstream(response, "GitHub rejected the check gist star request.");
    },
    async getGistComment(input: unknown) {
      const payload = validateGetGistCommentInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/comments/${payload.commentId}`);
      return readObject(response, "comment", normalizeGistComment, "Gist comment not found.", "GitHub rejected the get gist comment request.");
    },
    async getGistRevision(input: unknown) {
      const payload = validateGetGistRevisionInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/${seg(payload.sha)}`);
      return readObject(response, "gist", normalizeGist, "Gist revision not found.", "GitHub rejected the get gist revision request.");
    },
    async listUserGists(input: unknown) {
      const payload = validateListUserGistsInput(input);
      const response = await client.fetchJSON(`/users/${seg(payload.username)}/gists${pageQuery(payload)}`);
      return readList(response, "gists", normalizeGist, "User gists not found.", "GitHub rejected the list user gists request.");
    },
    async listGistComments(input: unknown) {
      const payload = validateListGistCommentsInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/comments${pageQuery(payload)}`);
      return readList(response, "comments", normalizeGistComment, "Gist comments not found.", "GitHub rejected the list gist comments request.");
    },
    async listGistCommits(input: unknown) {
      const payload = validateListGistCommitsInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/commits${pageQuery(payload)}`);
      return readList(response, "commits", normalizeGistCommit, "Gist commits not found.", "GitHub rejected the list gist commits request.");
    },
    async listGistForks(input: unknown) {
      const payload = validateListGistForksInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/forks${pageQuery(payload)}`);
      return readList(response, "forks", normalizeGist, "Gist forks not found.", "GitHub rejected the list gist forks request.");
    },
    async listPublicGists(input: unknown) {
      const payload = validateListPublicGistsInput(input);
      const response = await client.fetchJSON(`/gists/public${pageQuery(payload)}`);
      return readList(response, "gists", normalizeGist, "Public gists not found.", "GitHub rejected the list public gists request.");
    },
    async listStarredGists(input: unknown) {
      const payload = validateListStarredGistsInput(input);
      const response = await client.fetchJSON(`/gists/starred${pageQuery(payload)}`);
      return readList(response, "gists", normalizeGist, "Starred gists not found.", "GitHub rejected the list starred gists request.");
    },
    async checkIssueAssignee(input: unknown) {
      const payload = validateCheckIssueAssigneeInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/${payload.issueNumber}/assignees/${seg(payload.assignee)}`);
      // Docs: 204 if the user can be assigned to this issue, 404 if they cannot. Neither is an error.
      if (response.status === 204) return { ok: true as const, assignable: true as const };
      if (response.status === 404) return { ok: true as const, assignable: false as const };
      return mapRateOrUpstream(response, "GitHub rejected the check issue assignee request.");
    },
    async getIssueEvent(input: unknown) {
      const payload = validateGetIssueEventInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/events/${payload.eventId}`);
      return readObject(response, "event", normalizeIssueEvent, "Issue event not found.", "GitHub rejected the get issue event request.");
    },
    async listAssignedIssues(input: unknown) {
      const payload = validateListAssignedIssuesInput(input);
      const response = await client.fetchJSON(`/issues${pageQuery(payload)}`);
      return readList(response, "issues", normalizeIssue, "Assigned issues not found.", "GitHub rejected the list assigned issues request.");
    },
    async listRepoIssueComments(input: unknown) {
      const payload = validateListRepoIssueCommentsInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/comments${pageQuery(payload)}`);
      return readList(response, "comments", normalizeIssueComment, "Repository issue comments not found.", "GitHub rejected the list repository issue comments request.");
    },
    async listRepoIssueEvents(input: unknown) {
      const payload = validateListRepoIssueEventsInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/events${pageQuery(payload)}`);
      return readList(response, "events", normalizeIssueEvent, "Repository issue events not found.", "GitHub rejected the list repository issue events request.");
    },
    async listMilestoneLabels(input: unknown) {
      const payload = validateListMilestoneLabelsInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/milestones/${payload.milestoneNumber}/labels${pageQuery(payload)}`);
      return readList(response, "labels", normalizeLabel, "Milestone labels not found.", "GitHub rejected the list milestone labels request.");
    },
  };
}

function readObject<T>(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, normalize: (item: Record<string, unknown>) => T, missing: string, rejected: string) {
  if (response.status === 200 && isRecord(response.body)) return { ok: true as const, [field]: normalize(response.body) };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function readList<T>(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, normalize: (item: Record<string, unknown>) => T, missing: string, rejected: string) {
  if (response.status === 200 && Array.isArray(response.body)) {
    return { ok: true as const, [field]: response.body.filter(isRecord).map(normalize) };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function normalizeGist(item: Record<string, unknown>): NormalizedGist {
  const owner = isRecord(item.owner) ? item.owner : {};
  return {
    id: typeof item.id === "string" ? item.id : "",
    description: typeof item.description === "string" ? item.description : "",
    public: item.public === true,
    owner: typeof owner.login === "string" ? owner.login : "",
  };
}

function normalizeGistComment(item: Record<string, unknown>): NormalizedGistComment {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    body: typeof item.body === "string" ? item.body : "",
    user: typeof user.login === "string" ? user.login : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function normalizeGistCommit(item: Record<string, unknown>): NormalizedGistCommit {
  const user = isRecord(item.user) ? item.user : {};
  return {
    sha: typeof item.version === "string" ? item.version : (typeof item.sha === "string" ? item.sha : ""),
    user: typeof user.login === "string" ? user.login : "",
    committedAt: typeof item.committed_at === "string" ? item.committed_at : "",
  };
}

function normalizeIssue(item: Record<string, unknown>): NormalizedIssue {
  return {
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    state: typeof item.state === "string" ? item.state : "",
  };
}

function normalizeIssueComment(item: Record<string, unknown>): NormalizedIssueComment {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    body: typeof item.body === "string" ? item.body : "",
    user: typeof user.login === "string" ? user.login : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function normalizeIssueEvent(item: Record<string, unknown>): NormalizedIssueEvent {
  const actor = isRecord(item.actor) ? item.actor : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    event: typeof item.event === "string" ? item.event : "",
    actor: typeof actor.login === "string" ? actor.login : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function normalizeLabel(item: Record<string, unknown>): NormalizedLabel {
  return {
    name: typeof item.name === "string" ? item.name : "",
    color: typeof item.color === "string" ? item.color : "",
    description: typeof item.description === "string" ? item.description : "",
  };
}

function pageQuery(payload: Page): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function seg(value: string): string {
  return encodeURIComponent(value);
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

function requireObject(input: unknown, action: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return input;
}

function gistId(input: Record<string, unknown>): GistId {
  return { gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gist_id") };
}

function repo(input: Record<string, unknown>): Repo {
  return { owner: requireSingleSegment(input.owner, "owner"), repo: requireSingleSegment(input.repo, "repo") };
}

function pageOf(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) throw new Error(`${field} must be a single path segment`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
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
