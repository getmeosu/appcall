import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import resourceFixture from "../fixtures/deepened_resource.json";
import listFixture from "../fixtures/deepened_list.json";

export const ADDED_ACTIONS = [
  "branches.create",
  "branches.delete",
  "branches.get",
  "branches.protect",
  "branches.unprotect",
  "groups.billableMembers.list",
  "groups.create",
  "groups.delete",
  "groups.members.get",
  "groups.members.list",
  "groups.members.listAll",
  "groups.pendingMembers.list",
  "groups.projects.list",
  "groups.update",
  "issues.addSpentTime",
  "issues.move",
  "issues.notes.delete",
  "issues.notes.get",
  "issues.notes.list",
  "issues.notes.update",
  "issues.resetSpentTime",
  "issues.resetTimeEstimate",
  "issues.setTimeEstimate",
  "issues.timeStats",
  "jobs.cancel",
  "jobs.erase",
  "jobs.play",
  "jobs.trace",
  "labels.create",
  "labels.delete",
  "labels.get",
  "labels.list",
  "labels.update",
  "mergeRequests.approvalState.get",
  "mergeRequests.approvals.get",
  "mergeRequests.approve",
  "mergeRequests.commits.list",
  "mergeRequests.delete",
  "mergeRequests.diffVersions.list",
  "mergeRequests.diffs.list",
  "mergeRequests.discussions.list",
  "mergeRequests.draftNotes.create",
  "mergeRequests.listAll",
  "mergeRequests.notes.list",
  "mergeRequests.unapprove",
  "milestones.create",
  "milestones.delete",
  "milestones.get",
  "milestones.list",
  "milestones.update",
  "pipelines.cancel",
  "pipelines.delete",
  "pipelines.retry",
  "projectHooks.create",
  "projectHooks.delete",
  "projectHooks.get",
  "projectHooks.list",
  "projectHooks.update",
  "projects.archive",
  "projects.delete",
  "projects.downloadAvatar",
  "projects.fork",
  "projects.groups.list",
  "projects.housekeeping",
  "projects.importMembers",
  "projects.invitedGroups.list",
  "projects.languages",
  "projects.members.get",
  "projects.members.getAll",
  "projects.members.listAll",
  "projects.share",
  "projects.shareableGroups.list",
  "projects.star",
  "projects.tags.list",
  "projects.transferLocations.list",
  "projects.unstar",
  "projects.users.list",
  "repository.commits.create",
  "repository.commits.createComment",
  "repository.commits.get",
  "repository.commits.listComments",
  "repository.commits.refs",
  "repository.commits.sequence",
  "repository.files.create",
  "repository.files.delete",
  "repository.files.raw",
  "repository.files.update",
  "repository.tree.list",
  "users.get",
  "users.list",
  "users.me",
  "users.preferences.get",
  "users.preferences.update",
  "users.projects.list",
  "users.status.get",
  "users.status.getById",
  "users.status.set",
  "users.supportPin.create",
  "users.supportPin.get",
  "users.validateCredential"
] as const;

export const COMPOSIO_SLUG_MAP = {
  "GITLAB_CREATE_ISSUE_NOTE": "issues.comment",
  "GITLAB_CREATE_MERGE_REQUEST": "mergeRequests.create",
  "GITLAB_CREATE_PIPELINE": "pipelines.create",
  "GITLAB_CREATE_PROJECT": "projects.create",
  "GITLAB_CREATE_PROJECT_ISSUE": "issues.create",
  "GITLAB_GET_FILE": "repository.files.get",
  "GITLAB_GET_GROUP": "groups.get",
  "GITLAB_GET_GROUPS": "groups.list",
  "GITLAB_GET_ISSUE": "issues.get",
  "GITLAB_GET_JOB_DETAILS": "jobs.get",
  "GITLAB_GET_PROJECT": "projects.get",
  "GITLAB_GET_PROJECT_MERGE_REQUEST": "mergeRequests.get",
  "GITLAB_GET_PROJECT_MERGE_REQUESTS": "mergeRequests.list",
  "GITLAB_GET_PROJECTS": "projects.list",
  "GITLAB_GET_REPOSITORY_BRANCHES": "branches.list",
  "GITLAB_GET_SINGLE_PIPELINE": "pipelines.get",
  "GITLAB_LIST_PIPELINE_JOBS": "jobs.list",
  "GITLAB_LIST_PROJECT_ISSUES": "issues.list",
  "GITLAB_LIST_PROJECT_PIPELINES": "pipelines.list",
  "GITLAB_LIST_REPOSITORY_COMMITS": "repository.commits.list",
  "GITLAB_MERGE_MERGE_REQUEST": "mergeRequests.merge",
  "GITLAB_UPDATE_MERGE_REQUEST": "mergeRequests.update",
  "GITLAB_UPDATE_PROJECT_ISSUE": "issues.update",
  "GITLAB_ADD_SPENT_TIME": "issues.addSpentTime",
  "GITLAB_APPROVE_MERGE_REQUEST": "mergeRequests.approve",
  "GITLAB_ARCHIVE_PROJECT": "projects.archive",
  "GITLAB_CANCEL_JOB": "jobs.cancel",
  "GITLAB_CANCEL_PIPELINE": "pipelines.cancel",
  "GITLAB_CREATE_COMMIT": "repository.commits.create",
  "GITLAB_CREATE_COMMIT_COMMENT": "repository.commits.createComment",
  "GITLAB_CREATE_FILE": "repository.files.create",
  "GITLAB_CREATE_GROUP": "groups.create",
  "GITLAB_CREATE_LABEL": "labels.create",
  "GITLAB_CREATE_MERGE_REQUEST_DRAFT_NOTE": "mergeRequests.draftNotes.create",
  "GITLAB_CREATE_MILESTONE": "milestones.create",
  "GITLAB_CREATE_REPOSITORY_BRANCH": "branches.create",
  "GITLAB_CREATE_WEBHOOK": "projectHooks.create",
  "GITLAB_DELETE_GROUP": "groups.delete",
  "GITLAB_DELETE_ISSUE_NOTE": "issues.notes.delete",
  "GITLAB_DELETE_LABEL": "labels.delete",
  "GITLAB_DELETE_MERGE_REQUEST": "mergeRequests.delete",
  "GITLAB_DELETE_MILESTONE": "milestones.delete",
  "GITLAB_DELETE_PIPELINE": "pipelines.delete",
  "GITLAB_DELETE_PROJECT": "projects.delete",
  "GITLAB_DELETE_REPOSITORY_BRANCH": "branches.delete",
  "GITLAB_DELETE_REPOSITORY_FILE": "repository.files.delete",
  "GITLAB_DELETE_WEBHOOK": "projectHooks.delete",
  "GITLAB_DOWNLOAD_PROJECT_AVATAR": "projects.downloadAvatar",
  "GITLAB_ERASE_JOB": "jobs.erase",
  "GITLAB_FORK_PROJECT": "projects.fork",
  "GITLAB_GET_COMMIT_REFS": "repository.commits.refs",
  "GITLAB_GET_COMMIT_SEQUENCE": "repository.commits.sequence",
  "GITLAB_GET_CURRENT_USER": "users.me",
  "GITLAB_GET_GROUP_MEMBER": "groups.members.get",
  "GITLAB_GET_ISSUE_NOTE": "issues.notes.get",
  "GITLAB_GET_JOB_TRACE": "jobs.trace",
  "GITLAB_GET_LABEL": "labels.get",
  "GITLAB_GET_MERGE_REQUEST_APPROVALS": "mergeRequests.approvals.get",
  "GITLAB_GET_MERGE_REQUEST_APPROVAL_STATE": "mergeRequests.approvalState.get",
  "GITLAB_GET_MERGE_REQUEST_NOTES": "mergeRequests.notes.list",
  "GITLAB_GET_MILESTONE": "milestones.get",
  "GITLAB_GET_PROJECT_LANGUAGES": "projects.languages",
  "GITLAB_GET_PROJECT_MEMBER": "projects.members.get",
  "GITLAB_GET_PROJECT_MEMBER_ALL": "projects.members.getAll",
  "GITLAB_GET_PROJECT_MERGE_REQUEST_COMMITS": "mergeRequests.commits.list",
  "GITLAB_GET_PROJECTS_ID_MERGE_REQUESTS_IID_DIFFS": "mergeRequests.diffVersions.list",
  "GITLAB_GET_RAW_FILE": "repository.files.raw",
  "GITLAB_GET_REPOSITORY_BRANCH": "branches.get",
  "GITLAB_GET_SINGLE_COMMIT": "repository.commits.get",
  "GITLAB_GET_TIME_STATS": "issues.timeStats",
  "GITLAB_GET_USER": "users.get",
  "GITLAB_GET_USER_PREFERENCES": "users.preferences.get",
  "GITLAB_GET_USERS": "users.list",
  "GITLAB_GET_USERS_ID_STATUS": "users.status.getById",
  "GITLAB_GET_USER_STATUS": "users.status.get",
  "GITLAB_GET_USER_SUPPORT_PIN": "users.supportPin.get",
  "GITLAB_GET_WEBHOOK": "projectHooks.get",
  "GITLAB_IMPORT_PROJECT_MEMBERS": "projects.importMembers",
  "GITLAB_LIST_ALL_GROUP_MEMBERS": "groups.members.listAll",
  "GITLAB_LIST_ALL_PROJECT_MEMBERS": "projects.members.listAll",
  "GITLAB_LIST_BILLABLE_GROUP_MEMBERS": "groups.billableMembers.list",
  "GITLAB_LIST_COMMIT_COMMENTS": "repository.commits.listComments",
  "GITLAB_LIST_GROUP_MEMBERS": "groups.members.list",
  "GITLAB_LIST_GROUP_PROJECTS": "groups.projects.list",
  "GITLAB_LIST_ISSUE_NOTES": "issues.notes.list",
  "GITLAB_LIST_LABELS": "labels.list",
  "GITLAB_LIST_MERGE_REQUEST_DIFFS": "mergeRequests.diffs.list",
  "GITLAB_LIST_MERGE_REQUEST_DISCUSSIONS": "mergeRequests.discussions.list",
  "GITLAB_LIST_MERGE_REQUESTS": "mergeRequests.listAll",
  "GITLAB_LIST_MILESTONES": "milestones.list",
  "GITLAB_LIST_PENDING_GROUP_MEMBERS": "groups.pendingMembers.list",
  "GITLAB_LIST_PROJECT_GROUPS": "projects.groups.list",
  "GITLAB_LIST_PROJECT_INVITED_GROUPS": "projects.invitedGroups.list",
  "GITLAB_LIST_PROJECT_SHAREABLE_GROUPS": "projects.shareableGroups.list",
  "GITLAB_LIST_PROJECT_TAGS": "projects.tags.list",
  "GITLAB_LIST_PROJECT_TRANSFER_LOCATIONS": "projects.transferLocations.list",
  "GITLAB_LIST_PROJECT_USERS": "projects.users.list",
  "GITLAB_LIST_REPOSITORY_TREE": "repository.tree.list",
  "GITLAB_LIST_USER_PROJECTS": "users.projects.list",
  "GITLAB_LIST_WEBHOOKS": "projectHooks.list",
  "GITLAB_MOVE_ISSUE": "issues.move",
  "GITLAB_PLAY_JOB": "jobs.play",
  "GITLAB_POST_USER_SUPPORT_PIN": "users.supportPin.create",
  "GITLAB_PROTECT_BRANCH": "branches.protect",
  "GITLAB_PUT_USER_PREFERENCES": "users.preferences.update",
  "GITLAB_RESET_SPENT_TIME": "issues.resetSpentTime",
  "GITLAB_RESET_TIME_ESTIMATE": "issues.resetTimeEstimate",
  "GITLAB_RETRY_PIPELINE": "pipelines.retry",
  "GITLAB_SET_TIME_ESTIMATE": "issues.setTimeEstimate",
  "GITLAB_SET_USER_STATUS": "users.status.set",
  "GITLAB_SHARE_PROJECT_WITH_GROUP": "projects.share",
  "GITLAB_STAR_PROJECT": "projects.star",
  "GITLAB_START_PROJECT_HOUSEKEEPING": "projects.housekeeping",
  "GITLAB_UNAPPROVE_MERGE_REQUEST": "mergeRequests.unapprove",
  "GITLAB_UNPROTECT_BRANCH": "branches.unprotect",
  "GITLAB_UNSTAR_PROJECT": "projects.unstar",
  "GITLAB_UPDATE_GROUP": "groups.update",
  "GITLAB_UPDATE_ISSUE_NOTE": "issues.notes.update",
  "GITLAB_UPDATE_LABEL": "labels.update",
  "GITLAB_UPDATE_MILESTONE": "milestones.update",
  "GITLAB_UPDATE_REPOSITORY_FILE": "repository.files.update",
  "GITLAB_UPDATE_WEBHOOK": "projectHooks.update",
  "GITLAB_VALIDATE_CREDENTIAL": "users.validateCredential"
} as const;

const { actions } = compileDeclarativeConnector(manifest as never);
const creds = { host: "gitlab.com", apiToken: "glpat-example-token" };

type Call = { url: string; init?: RequestInit };

function mockJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  };
  return { calls, fetchFn };
}

function sampleInput(key: string): Record<string, unknown> {
  const operation = (manifest.operations as Record<string, { inputSchema: { properties?: Record<string, { type?: string }>; required?: string[] } }>)[key]!;
  const input: Record<string, unknown> = {};
  const properties = operation.inputSchema.properties ?? {};
  for (const name of operation.inputSchema.required ?? []) {
    const type = properties[name]?.type;
    if (name === "projectId" || name === "sourceProjectId") input[name] = "diaspora/diaspora";
    else if (name === "groupId" && type !== "integer") input[name] = "gitlab-org/gitlab";
    else if (name === "filePath") input[name] = "lib/class.rb";
    else if (name === "duration") input[name] = "1h";
    else if (name === "url") input[name] = "https://example.test/hook";
    else if (name === "color") input[name] = "#FFAABB";
    else if (name === "sha") input[name] = "a".repeat(40);
    else if (name === "actions") input[name] = [{ action: "create", file_path: "README.md", content: "hi" }];
    else if (name === "branchName" || name === "ref" || name === "startBranch") input[name] = "main";
    else if (type === "integer") input[name] = 14;
    else if (type === "boolean") input[name] = true;
    else if (type === "array") input[name] = name === "actions" ? [{ action: "create", file_path: "README.md", content: "hi" }] : [1];
    else if (type === "object") input[name] = { key: "K", value: "V" };
    else input[name] = name === "path" ? "new-group" : "sample";
  }
  return input;
}

function expectedPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, name: string) => encodeURIComponent(String(input[name])));
}

describe("gitlab composio deepen", () => {
  it("compiles every added action", () => {
    for (const key of ADDED_ACTIONS) {
      expect(typeof actions[key], key).toBe("function");
    }
  });

  it("maps every Composio GitLab tool onto a real request-backed operation", () => {
    const operations = manifest.operations as Record<string, { kind: string; request?: unknown }>;
    for (const [slug, key] of Object.entries(COMPOSIO_SLUG_MAP)) {
      expect(operations[key], slug).toBeDefined();
      if (operations[key]!.kind === "action") {
        expect(operations[key]!.request, `${slug} -> ${key}`).toBeDefined();
      }
    }
  });

  it.each(ADDED_ACTIONS)("executes %s against the GitLab REST path", async (key) => {
    const operation = (manifest.operations as Record<string, { request: { method: string; path: string; result?: Record<string, unknown> } }>)[key]!;
    const input = sampleInput(key);
    const method = operation.request.method;
    const isList = Object.prototype.hasOwnProperty.call(operation.request.result ?? {}, "nextPage");
    const status = method === "DELETE" ? 204 : method === "GET" ? 200 : 201;
    const { calls, fetchFn } = mockJson(isList ? listFixture : resourceFixture, status, isList ? { "x-next-page": "2" } : {});
    const result = await actions[key]!({ ...creds, ...input, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.hostname).toBe("gitlab.com");
    expect(url.pathname).toBe(`/api/v4${expectedPath(operation.request.path, input)}`);
    expect(calls[0]!.init?.method ?? "GET").toBe(method);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer glpat-example-token");
    expect(result.source).toBe("provider");
    expect(result.action).toBe(key);
    if (isList) expect(result.nextPage).toBe("2");
    if (method === "DELETE" && (operation.request.result as { deleted?: boolean } | undefined)?.deleted) {
      expect(result.deleted).toBe(true);
    }
  });

  it("rejects missing path input on a namespaced project action", () => {
    expect(() => actions["labels.create"]!({ name: "bug", color: "#ff0000" })).toThrow("projectId is required");
  });

  it("percent-encodes a namespaced project path on a newly added write", async () => {
    const { calls, fetchFn } = mockJson(resourceFixture, 201);
    await actions["labels.create"]!({
      ...creds,
      projectId: "diaspora/diaspora",
      name: "bug",
      color: "#FFAABB",
      fetch: fetchFn,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/diaspora%2Fdiaspora/labels");
  });

  it("creates a branch with GitLab's documented query parameters", async () => {
    const { calls, fetchFn } = mockJson(resourceFixture, 201);
    await actions["branches.create"]!({
      ...creds,
      projectId: "4",
      branchName: "feature/new",
      ref: "main",
      fetch: fetchFn,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v4/projects/4/repository/branches");
    expect(url.searchParams.get("branch")).toBe("feature/new");
    expect(url.searchParams.get("ref")).toBe("main");
  });

  it("approves a merge request on the iid-scoped approvals path", async () => {
    const { calls, fetchFn } = mockJson(resourceFixture, 201);
    await actions["mergeRequests.approve"]!({
      ...creds,
      projectId: "4",
      mergeRequestIid: 1,
      sha: "abc",
      fetch: fetchFn,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/merge_requests/1/approve");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ sha: "abc" });
  });

  it("logs spent time against the issue time-tracking endpoint", async () => {
    const { calls, fetchFn } = mockJson(resourceFixture, 201);
    await actions["issues.addSpentTime"]!({
      ...creds,
      projectId: "4",
      issueIid: 14,
      duration: "3h30m",
      summary: "review",
      fetch: fetchFn,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/api/v4/projects/4/issues/14/add_spent_time");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ duration: "3h30m", summary: "review" });
  });
});
