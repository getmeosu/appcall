import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import hooksFixture from "../fixtures/org_hooks_list.json";
import reactionsFixture from "../fixtures/reactions_list.json";
import runnerFixture from "../fixtures/actions_runner.json";
import labelsFixture from "../fixtures/runner_labels.json";
import {
  listOrgHooks,
  listIssueReactions,
  listIssueCommentReactions,
  listCommitCommentReactions,
  listReviewCommentReactions,
  listReleaseReactions,
  getOrgActionsRunner,
  getRepoActionsRunner,
  listRepoActionsRunnerLabels,
} from "../src/actions";
import {
  validateListOrgHooksInput,
  validateListIssueReactionsInput,
  validateListReleaseReactionsInput,
  validateGetOrgRunnerInput,
  validateListRepoRunnerLabelsInput,
} from "../src/card10_reads";

const READS = [
  "orgs.hooks.list",
  "issues.reactions.list",
  "issues.comments.reactions.list",
  "commits.comments.reactions.list",
  "pull_requests.review_comments.reactions.list",
  "releases.reactions.list",
  "orgs.actions.runners.get",
  "repos.actions.runners.get",
  "repos.actions.runners.labels.list",
] as const;

describe("github card-10 reads", () => {
  test("manifest stays v0.43.0 at 424 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.43.0");
    expect(manifest.version).not.toBe("0.37.0");
    expect(Object.keys(manifest.operations).length).toBe(424);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    const orgGet = manifest.operations["orgs.hooks.get"] as Record<string, unknown>;
    expect(orgGet.sideEffect).toBe("read");
    expect(manifest.operations["repos.hooks.list"]).toBeDefined();
    expect(manifest.operations["repos.fork"].sideEffect).toBe("write");
    expect(manifest.operations["repos.assignees.check"]).toBeDefined();
  });

  test("validates required path fields and documented filters", () => {
    expect(validateListOrgHooksInput({ org: "octocat", perPage: 30, page: 2 })).toEqual({
      org: "octocat",
      perPage: 30,
      page: 2,
    });
    expect(() => validateListOrgHooksInput({ org: "octo/cat" })).toThrow(/org/);
    expect(() => validateListOrgHooksInput({})).toThrow(/org/);
    expect(validateListIssueReactionsInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "+1",
      perPage: 10,
      page: 2,
    })).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: "+1",
      perPage: 10,
      page: 2,
    });
    expect(() => validateListIssueReactionsInput({ owner: "octocat", repo: "Hello-World", issueNumber: 1, content: "thumb" })).toThrow(/content/);
    expect(() => validateListIssueReactionsInput({ owner: "octocat", repo: "Hello-World", issueNumber: 1, perPage: 101 })).toThrow(/perPage/);
    expect(validateListReleaseReactionsInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "hooray",
    }).content).toBe("hooray");
    expect(() => validateListReleaseReactionsInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "-1",
    })).toThrow(/content/);
    expect(() => validateListReleaseReactionsInput({
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "confused",
    })).toThrow(/content/);
    expect(validateGetOrgRunnerInput({ org: "octocat", runnerId: 23 })).toEqual({ org: "octocat", runnerId: 23 });
    expect(() => validateGetOrgRunnerInput({ org: "octocat" })).toThrow(/runnerId/);
    expect(validateListRepoRunnerLabelsInput({ owner: "octocat", repo: "Hello-World", runnerId: 23 }).runnerId).toBe(23);
    expect(() => validateListRepoRunnerLabelsInput({ owner: "octo/cat", repo: "Hello-World", runnerId: 23 })).toThrow(/owner/);
  });

  test("lists organization hooks with an encoded path", async () => {
    const result = await listOrgHooks({
      accessToken: "t",
      org: "octo cat",
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/hooks?per_page=30&page=2");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        expect(String(input)).not.toContain("/hooks/");
        return new Response(JSON.stringify(hooksFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("orgs.hooks.list");
    expect((result.hooks as { hookId: number; name: string; active: boolean; configUrl: string }[])[0]).toMatchObject({
      hookId: 7,
      name: "web",
      active: true,
      configUrl: "https://example.com/hook",
    });
  });

  test("lists issue reactions with the documented content filter", async () => {
    const result = await listIssueReactions({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      issueNumber: 4,
      content: "+1",
      perPage: 10,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/issues/4/reactions?content=%2B1&per_page=10&page=2");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(reactionsFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("issues.reactions.list");
    expect((result.reactions as { id: number; content: string; userLogin: string }[])[0]).toMatchObject({
      id: 1,
      content: "heart",
      userLogin: "octocat",
    });
  });

  test("lists the other reaction routes", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify(reactionsFixture), { status: 200 });
    };
    await listIssueCommentReactions({ accessToken: "t", owner: "octocat", repo: "Hello-World", commentId: 11, fetch });
    await listCommitCommentReactions({ accessToken: "t", owner: "octocat", repo: "Hello-World", commentId: 12, content: "eyes", fetch });
    await listReviewCommentReactions({ accessToken: "t", owner: "octocat", repo: "Hello-World", commentId: 13, fetch });
    const release = await listReleaseReactions({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 9,
      content: "rocket",
      perPage: 5,
      page: 1,
      fetch,
    });
    expect(seen).toEqual([
      "https://api.github.com/repos/octocat/Hello-World/issues/comments/11/reactions",
      "https://api.github.com/repos/octocat/Hello-World/comments/12/reactions?content=eyes",
      "https://api.github.com/repos/octocat/Hello-World/pulls/comments/13/reactions",
      "https://api.github.com/repos/octocat/Hello-World/releases/9/reactions?content=rocket&per_page=5&page=1",
    ]);
    expect(release.action).toBe("releases.reactions.list");
    expect((release.reactions as { content: string }[])[0].content).toBe("heart");
  });

  test("gets runners and lists repository runner labels", async () => {
    const org = await getOrgActionsRunner({
      accessToken: "t",
      org: "octo cat",
      runnerId: 23,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/actions/runners/23");
        expect(String(input)).not.toContain("registration-token");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(runnerFixture), { status: 200 });
      },
    });
    expect(org.action).toBe("orgs.actions.runners.get");
    expect(org.runner).toMatchObject({ id: 23, name: "linux-runner", os: "Linux", status: "online", busy: false });

    const repo = await getRepoActionsRunner({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      runnerId: 23,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octocat/Hello-World/actions/runners/23");
        return new Response(JSON.stringify(runnerFixture), { status: 200 });
      },
    });
    expect(repo.action).toBe("repos.actions.runners.get");

    const labels = await listRepoActionsRunnerLabels({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      runnerId: 23,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/actions/runners/23/labels");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(labelsFixture), { status: 200 });
      },
    });
    expect(labels.action).toBe("repos.actions.runners.labels.list");
    expect(labels.totalCount).toBe(2);
    expect((labels.labels as { name: string; type: string }[])[1]).toMatchObject({ name: "gpu", type: "custom" });
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listOrgHooks({
      accessToken: "t",
      org: "octocat",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = new Response("{}", { status: 404 });
    await expect(listOrgHooks({
      accessToken: "t",
      org: "missing",
      fetch: async () => missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listIssueReactions({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listReleaseReactions({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      releaseId: 1,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgActionsRunner({
      accessToken: "t",
      org: "octocat",
      runnerId: 99,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getRepoActionsRunner({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      runnerId: 99,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoActionsRunnerLabels({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      runnerId: 99,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = listIssueReactions({ owner: "octocat", repo: "Hello-World", issueNumber: 4 });
    expect(result.action).toBe("issues.reactions.list");
    expect(result.validated).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      content: undefined,
      perPage: undefined,
      page: undefined,
    });
  });
});
