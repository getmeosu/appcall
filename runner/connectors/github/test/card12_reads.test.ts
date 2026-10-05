import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  checkGistStar,
  getGistComment,
  getGistRevision,
  listUserGists,
  listGistComments,
  listGistCommits,
  listGistForks,
  listPublicGists,
  listStarredGists,
  checkIssueAssignee,
  getIssueEvent,
  listAssignedIssues,
  listRepoIssueComments,
  listRepoIssueEvents,
  listMilestoneLabels,
} from "../src/actions";

const READS = [
  "gists.star.check",
  "gists.comments.get",
  "gists.revision.get",
  "users.gists.list",
  "gists.comments.list",
  "gists.commits.list",
  "gists.forks.list",
  "gists.public.list",
  "gists.starred.list",
  "issues.assignees.check",
  "issues.events.get",
  "issues.assigned.list",
  "repos.issues.comments.list",
  "repos.issues.events.list",
  "milestones.labels.list",
] as const;

const PATHS: Record<(typeof READS)[number], string> = {
  "gists.star.check": "GET /gists/{gist_id}/star",
  "gists.comments.get": "GET /gists/{gist_id}/comments/{comment_id}",
  "gists.revision.get": "GET /gists/{gist_id}/{sha}",
  "users.gists.list": "GET /users/{username}/gists",
  "gists.comments.list": "GET /gists/{gist_id}/comments",
  "gists.commits.list": "GET /gists/{gist_id}/commits",
  "gists.forks.list": "GET /gists/{gist_id}/forks",
  "gists.public.list": "GET /gists/public",
  "gists.starred.list": "GET /gists/starred",
  "issues.assignees.check": "GET /repos/{owner}/{repo}/issues/{issue_number}/assignees/{assignee}",
  "issues.events.get": "GET /repos/{owner}/{repo}/issues/events/{event_id}",
  "issues.assigned.list": "GET /issues",
  "repos.issues.comments.list": "GET /repos/{owner}/{repo}/issues/comments",
  "repos.issues.events.list": "GET /repos/{owner}/{repo}/issues/events",
  "milestones.labels.list": "GET /repos/{owner}/{repo}/milestones/{milestone_number}/labels",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github card-12 reads", () => {
  test("version stays 0.76.0 at 782 ops and the new reads omit effect policy", () => {
    expect(manifest.version).toBe("0.76.0");
    expect(Object.keys(manifest.operations).length).toBe(782);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    const repoCheck = manifest.operations["repos.assignees.check"] as Record<string, unknown>;
    expect(repoCheck.sideEffect).toBe("read");
    expect(String(repoCheck.description)).toContain("GET /repos/{owner}/{repo}/assignees/{assignee}");
    expect(String(repoCheck.description)).toContain("assigned true");
    const issueCheck = manifest.operations["issues.assignees.check"] as Record<string, unknown>;
    expect(String(issueCheck.description)).toContain("assignable true");
    expect(String(issueCheck.description)).not.toContain("assigned true");
    expect(String(manifest.operations["gists.star.check"].description)).not.toContain("/gists/starred");
    expect(manifest.operations["gists.get"]).toBeDefined();
    expect(manifest.operations["gists.list"]).toBeDefined();
    expect(manifest.operations["issues.comments.list"]).toBeDefined();
    expect(manifest.operations["issues.comments.get"]).toBeDefined();
    expect(manifest.operations["issues.events.list"]).toBeDefined();
    expect(manifest.operations["issues.list"]).toBeDefined();
    expect(manifest.operations["milestones.get"]).toBeDefined();
  });

  test("204 and 404 are success for the two checks, and ordinary reads keep 404 upstream", async () => {
    const calls: string[] = [];
    const fetchOf = (body: unknown, status = 200) => async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return status === 204 || status === 404 && body === null ? empty(status) : json(body, status);
    };
    const missing = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json({ message: "Not Found" }, 404);
    };

    const starred = await checkGistStar({ accessToken: "t", gistId: "abc", fetch: fetchOf(null, 204) });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/abc/star");
    expect(starred.starred).toBe(true);
    const unstarred = await checkGistStar({ accessToken: "t", gistId: "abc", fetch: async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return empty(404);
    } });
    expect(unstarred.starred).toBe(false);

    const comment = await getGistComment({
      accessToken: "t", gistId: "abc", commentId: 4,
      fetch: fetchOf({ id: 4, body: "hi", user: { login: "octo" }, created_at: "2026-01-01T00:00:00Z" }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/abc/comments/4");
    expect((comment.comment as Record<string, unknown>).body).toBe("hi");
    await expect(getGistComment({ accessToken: "t", gistId: "abc", commentId: 4, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const revision = await getGistRevision({
      accessToken: "t", gistId: "abc", sha: "deadbeef",
      fetch: fetchOf({ id: "abc", description: "rev", public: true, owner: { login: "octo" } }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/abc/deadbeef");
    expect(revision.gist).toMatchObject({ id: "abc", owner: "octo", public: true });
    await expect(getGistRevision({ accessToken: "t", gistId: "abc", sha: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const userGists = await listUserGists({
      accessToken: "t", username: "octo", perPage: 5,
      fetch: fetchOf([{ id: "g1", description: "mine", public: false, owner: { login: "octo" } }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octo/gists?per_page=5");
    expect((userGists.gists as Array<Record<string, unknown>>)[0].id).toBe("g1");
    await expect(listUserGists({ accessToken: "t", username: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const comments = await listGistComments({
      accessToken: "t", gistId: "abc", page: 2,
      fetch: fetchOf([{ id: 8, body: "note", user: { login: "octo" }, created_at: "2026-02-01T00:00:00Z" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/abc/comments?page=2");
    expect((comments.comments as Array<Record<string, unknown>>)[0].id).toBe(8);
    await expect(listGistComments({ accessToken: "t", gistId: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const commits = await listGistCommits({
      accessToken: "t", gistId: "abc",
      fetch: fetchOf([{ version: "aaa", user: { login: "octo" }, committed_at: "2026-03-01T00:00:00Z" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/abc/commits");
    expect((commits.commits as Array<Record<string, unknown>>)[0].sha).toBe("aaa");
    await expect(listGistCommits({ accessToken: "t", gistId: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const forks = await listGistForks({
      accessToken: "t", gistId: "abc",
      fetch: fetchOf([{ id: "fork1", description: "", public: true, owner: { login: "hubot" } }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/abc/forks");
    expect((forks.forks as Array<Record<string, unknown>>)[0].owner).toBe("hubot");
    await expect(listGistForks({ accessToken: "t", gistId: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const publicGists = await listPublicGists({
      accessToken: "t", page: 3,
      fetch: fetchOf([{ id: "pub", description: "p", public: true, owner: { login: "octo" } }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/public?page=3");
    expect(String(calls.at(-1))).not.toContain("/star");
    expect((publicGists.gists as Array<Record<string, unknown>>)[0].id).toBe("pub");
    await expect(listPublicGists({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const starredList = await listStarredGists({
      accessToken: "t",
      fetch: fetchOf([{ id: "starred", description: "s", public: true, owner: { login: "octo" } }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/gists/starred");
    expect((starredList.gists as Array<Record<string, unknown>>)[0].id).toBe("starred");
    await expect(listStarredGists({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const assignable = await checkIssueAssignee({
      accessToken: "t", owner: "acme", repo: "app", issueNumber: 7, assignee: "octo",
      fetch: fetchOf(null, 204),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/issues/7/assignees/octo");
    expect(assignable.assignable).toBe(true);
    expect(assignable).not.toHaveProperty("assigned");
    const notAssignable = await checkIssueAssignee({
      accessToken: "t", owner: "acme", repo: "app", issueNumber: 7, assignee: "hubot",
      fetch: async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return empty(404);
      },
    });
    expect(notAssignable.assignable).toBe(false);

    const event = await getIssueEvent({
      accessToken: "t", owner: "acme", repo: "app", eventId: 11,
      fetch: fetchOf({ id: 11, event: "labeled", actor: { login: "octo" }, created_at: "2026-04-01T00:00:00Z" }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/issues/events/11");
    expect(event.event).toMatchObject({ id: 11, event: "labeled", actor: "octo" });
    await expect(getIssueEvent({ accessToken: "t", owner: "acme", repo: "app", eventId: 11, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const assigned = await listAssignedIssues({
      accessToken: "t", perPage: 10,
      fetch: fetchOf([{ number: 3, title: "Bug", state: "open" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/issues?per_page=10");
    expect((assigned.issues as Array<Record<string, unknown>>)[0].title).toBe("Bug");
    await expect(listAssignedIssues({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const repoComments = await listRepoIssueComments({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: fetchOf([{ id: 20, body: "repo note", user: { login: "octo" }, created_at: "2026-05-01T00:00:00Z" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/issues/comments");
    expect((repoComments.comments as Array<Record<string, unknown>>)[0].body).toBe("repo note");
    await expect(listRepoIssueComments({ accessToken: "t", owner: "acme", repo: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const repoEvents = await listRepoIssueEvents({
      accessToken: "t", owner: "acme", repo: "app", page: 2,
      fetch: fetchOf([{ id: 21, event: "closed", actor: { login: "octo" }, created_at: "2026-06-01T00:00:00Z" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/issues/events?page=2");
    expect((repoEvents.events as Array<Record<string, unknown>>)[0].event).toBe("closed");
    await expect(listRepoIssueEvents({ accessToken: "t", owner: "missing", repo: "app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const labels = await listMilestoneLabels({
      accessToken: "t", owner: "acme", repo: "app", milestoneNumber: 2,
      fetch: fetchOf([{ name: "bug", color: "d73a4a", description: "a bug" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/milestones/2/labels");
    expect((labels.labels as Array<Record<string, unknown>>)[0].name).toBe("bug");
    await expect(listMilestoneLabels({ accessToken: "t", owner: "acme", repo: "app", milestoneNumber: 2, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
