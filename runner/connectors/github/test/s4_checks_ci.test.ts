import { describe, expect, test } from "bun:test";
import compareFixture from "../fixtures/compare_commits.json";
import updatePrBranchFixture from "../fixtures/update_pr_branch.json";
import listBranchesFixture from "../fixtures/list_branches.json";
import { compareRepos, updatePullRequestBranch, listBranches } from "../src/actions";

describe("github S4 repos/pr/branches actions", () => {
  test("compareRepos validates and encodes base/head", async () => {
    const sync = compareRepos({ owner: "acme", repo: "app", base: "main", head: "feature/x" });
    expect(sync.action).toBe("repos.compare");

    const requests: Request[] = [];
    const result = await compareRepos({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      base: "main",
      head: "feature/x",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(compareFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/compare/main...feature%2Fx");
    expect((result.comparison as Record<string, unknown>).status).toBe("ahead");
    expect((result.comparison as Record<string, unknown>).aheadBy).toBe(2);
  });

  test("compareRepos missing head throws", () => {
    expect(() => compareRepos({ owner: "acme", repo: "app", base: "main" })).toThrow("head is required");
  });

  test("updatePullRequestBranch puts update-branch", async () => {
    const sync = updatePullRequestBranch({ owner: "acme", repo: "app", pullNumber: 12 });
    expect(sync.action).toBe("pull_requests.update_branch");

    const requests: Request[] = [];
    const result = await updatePullRequestBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 12,
      expectedHeadSha: "abc123def456abc123def456abc123def456abc1",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(updatePrBranchFixture), { status: 202 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/12/update-branch");
    const body = JSON.parse(await requests[0].text());
    expect(body.expected_head_sha).toBe("abc123def456abc123def456abc123def456abc1");
    expect((result.update as Record<string, unknown>).accepted).toBe(true);
  });

  test("updatePullRequestBranch maps 422", async () => {
    await expect(
      updatePullRequestBranch({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 12,
        fetch: async () => new Response(JSON.stringify({ message: "Merge conflict" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("listBranches validates and lists", async () => {
    const sync = listBranches({ owner: "acme", repo: "app" });
    expect(sync.action).toBe("branches.list");

    const requests: Request[] = [];
    const result = await listBranches({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      perPage: 30,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listBranchesFixture), { status: 200 });
      },
    });
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/branches?per_page=30");
    expect((result.branches as Record<string, unknown>[]).length).toBe(2);
    expect((result.branches as Record<string, unknown>[])[0].name).toBe("main");
    expect((result.branches as Record<string, unknown>[])[0].protected).toBe(true);
  });
});
