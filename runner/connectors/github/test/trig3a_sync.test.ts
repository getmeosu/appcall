import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import artifactsFixture from "../fixtures/trig3a/artifacts.json";
import workflowsFixture from "../fixtures/trig3a/workflows.json";
import deploymentsFixture from "../fixtures/trig3a/deployments.json";
import followersFixture from "../fixtures/trig3a/followers.json";
import statusesFixture from "../fixtures/trig3a/deployment_statuses.json";
import issuesFixture from "../fixtures/issues_list.json";
import { listArtifacts, listAuthenticatedUserFollowers, listDeploymentStatuses, listDeployments, listWorkflows } from "../src/actions";
import {
  executeArtifactsSync,
  executeCommitsListSync,
  executeDeploymentsSync,
  executeFollowersSync,
  executeIssuesListSync,
  executePullRequestsListSync,
  executeRepositoriesListSync,
  executeWorkflowsSync,
} from "../src/sync";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const ops = manifest.operations as Record<string, Record<string, unknown>>;

function mockFetch(body: unknown, link?: string, status = 200, extra: Record<string, string> = {}) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: { ...(init.headers as Record<string, string>) }, body: init.body ?? null });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(link ? { link } : {}), ...extra } });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const NEXT = (page: number, path: string) =>
  `<https://api.github.com${path}?per_page=100&page=${page}>; rel="next", <https://api.github.com${path}?per_page=100&page=9>; rel="last"`;

const POLLING = {
  "actions.artifacts.sync": { action: "actions.artifacts.list", onNew: ["GITHUB_ARTIFACT_CREATED_TRIGGER", "GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED"], onChanged: undefined },
  "actions.workflows.sync": { action: "actions.workflows.list", onNew: ["GITHUB_WORKFLOW_ADDED_TRIGGER"], onChanged: undefined },
  "deployments.sync": { action: "deployments.list", onNew: undefined, onChanged: ["GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER"] },
  "user.followers.sync": { action: "user.followers.list", onNew: ["GITHUB_FOLLOWER_EVENT"], onChanged: undefined },
} as const;

describe("TRIG-3a manifest", () => {
  test("version and op counts", () => {
    expect(manifest.version).toBe("0.89.9");
    const kinds = Object.values(ops).map((op) => op.kind);
    expect([kinds.filter((k) => k === "action").length, kinds.filter((k) => k === "webhook").length, kinds.filter((k) => k === "sync").length]).toEqual([801, 47, 12]);
  });

  test("exactly the four TRIG-3a syncs declare poll, with the audit's triggers", () => {
    // TRIG-3b (v0.89.0) adds four more polled syncs; trig3b_sync.test.ts covers them.
    const TRIG_3B = ["releases.assets.sync", "repos.contents.sync", "repos.notifications.sync", "repos.readme.sync"];
    const polled = Object.entries(ops).filter(([key, op]) => op.poll !== undefined && !TRIG_3B.includes(key)).map(([key]) => key).sort();
    expect(polled).toEqual(Object.keys(POLLING).sort());
    for (const [key, want] of Object.entries(POLLING)) {
      const op = ops[key];
      const poll = op.poll as Record<string, unknown>;
      expect(op.kind).toBe("sync");
      expect(poll.itemKey).toBe("id");
      expect(poll.onNew).toEqual(want.onNew);
      expect(poll.onChanged).toEqual(want.onChanged);
      expect((op.inputSchema as Record<string, unknown>).additionalProperties).toBe(false);
      // The sync's input surface is the read action's, minus page (the cursor owns paging).
      const actionProps = Object.keys((ops[want.action].inputSchema as { properties: object }).properties).filter((p) => p !== "page").sort();
      expect(Object.keys((op.inputSchema as { properties: object }).properties).sort()).toEqual(actionProps);
    }
    expect((ops["deployments.sync"].poll as Record<string, unknown>).versionKey).toBe("latestStatusState");
    expect(String(ops["user.followers.sync"].description)).toContain("up to 1,000 followers");
    expect(String(ops["user.followers.sync"].description)).toContain("Unfollows are not reported.");
    expect(String(ops["actions.workflows.sync"].description)).toContain("up to 300 workflows");
    for (const legacy of ["issues.list", "pull_requests.list", "commits.list", "repositories.list"]) expect(ops[legacy].poll).toBeUndefined();
  });

  test("the TS registry loads the poll blocks and dispatches the syncs", async () => {
    const described = defaultConnectorRegistry.describe("github") as { version: string; operations: Record<string, Record<string, unknown>> };
    expect(described.version).toBe("0.89.9");
    for (const key of Object.keys(POLLING)) expect(described.operations[key].poll).toEqual(ops[key].poll);
    const { calls, fetchFn } = mockFetch(artifactsFixture);
    const result = defaultConnectorRegistry.executeSync("github", "actions.artifacts.sync", { owner: "octo-org", repo: "octo-docs", accessToken: "t", fetch: fetchFn, cursor: "3" });
    expect(result.ok).toBe(true);
    const output = await Promise.resolve((result as { output: unknown }).output) as Record<string, unknown>;
    expect((output.items as unknown[]).length).toBe(2);
    expect(output.cursor).toBeNull();
    expect(calls[0].url).toBe("https://api.github.com/repos/octo-org/octo-docs/actions/artifacts?per_page=100&page=3");
    const rejected = defaultConnectorRegistry.executeSync("github", "actions.artifacts.sync", { owner: "o", repo: "r", page: 2, accessToken: "t" });
    expect(rejected.ok).toBe(false);
  });
});

describe("TRIG-3a syncs reuse the read actions", () => {
  const cases = [
    { name: "actions.artifacts.sync", sync: executeArtifactsSync, action: listArtifacts, input: { owner: "octo-org", repo: "octo-docs", runId: 2332938, name: "Rails" }, body: artifactsFixture, path: "/repos/octo-org/octo-docs/actions/runs/2332938/artifacts", list: "artifacts" },
    { name: "actions.workflows.sync", sync: executeWorkflowsSync, action: listWorkflows, input: { owner: "octo-org", repo: "octo-repo" }, body: workflowsFixture, path: "/repos/octo-org/octo-repo/actions/workflows", list: "workflows" },
    { name: "user.followers.sync", sync: executeFollowersSync, action: listAuthenticatedUserFollowers, input: {}, body: followersFixture, path: "/user/followers", list: "users" },
  ] as const;

  for (const c of cases) {
    test(`${c.name}: byte-identical request, action items, cursor from Link`, async () => {
      const viaSync = mockFetch(c.body, NEXT(3, c.path));
      const page = await c.sync({ ...c.input, accessToken: "tok", fetch: viaSync.fetchFn, cursor: "2" });
      const viaAction = mockFetch(c.body);
      const out = await c.action({ ...c.input, perPage: (c.input as { perPage?: number }).perPage ?? 100, page: 2, accessToken: "tok", fetch: viaAction.fetchFn }) as Record<string, unknown>;
      expect(viaSync.calls).toEqual(viaAction.calls);
      expect(viaSync.calls[0].url.startsWith(`https://api.github.com${c.path}?`)).toBe(true);
      expect(viaSync.calls[0].headers.Authorization).toBe("Bearer tok");
      expect(page.cursor).toBe("3");
      expect(page.operation).toBe(c.name);
      const expected = (out[c.list] as Record<string, unknown>[]);
      expect(page.items).toEqual(expected);
      expect(page.items.length).toBe(2);
    });
  }

  test("first page omits page; last page returns cursor null", async () => {
    const { calls, fetchFn } = mockFetch(workflowsFixture);
    const page = await executeWorkflowsSync({ owner: "o", repo: "r", accessToken: "t", fetch: fetchFn });
    expect(calls[0].url).toBe("https://api.github.com/repos/o/r/actions/workflows?per_page=100");
    expect(page.cursor).toBeNull();
  });

  test("deployments.sync: deployments.list request, one newest-status read per deployment", async () => {
    const calls: Call[] = [];
    const route = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", headers: { ...(init.headers as Record<string, string>) }, body: init.body ?? null });
      const match = String(url).match(/deployments\/(\d+)\/statuses/);
      const body = match ? (statusesFixture as Record<string, unknown>)[match[1]] : deploymentsFixture;
      const link = match ? undefined : NEXT(2, "/repos/octocat/example/deployments");
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...(link ? { link } : {}) } });
    }) as unknown as typeof fetch;
    const input = { owner: "octocat", repo: "example", environment: "production" };
    const page = await executeDeploymentsSync({ ...input, accessToken: "tok", fetch: route });
    expect(page.cursor).toBe("2");
    const listCall = calls.find((c) => !c.url.includes("/statuses"))!;
    const viaAction = mockFetch(deploymentsFixture);
    const listed = await listDeployments({ ...input, perPage: 20, accessToken: "tok", fetch: viaAction.fetchFn }) as Record<string, unknown>;
    expect(listCall).toEqual(viaAction.calls[0]);
    const statusCalls = calls.filter((c) => c.url.includes("/statuses")).map((c) => c.url).sort();
    expect(statusCalls).toEqual([
      "https://api.github.com/repos/octocat/example/deployments/1/statuses?per_page=1",
      "https://api.github.com/repos/octocat/example/deployments/2/statuses?per_page=1",
    ]);
    // Same path as each deployment's statuses_url.
    for (const d of deploymentsFixture) expect(statusCalls).toContain(`${d.statuses_url}?per_page=1`);
    const viaStatus = mockFetch((statusesFixture as Record<string, unknown>)["1"]);
    const status = await listDeploymentStatuses({ owner: "octocat", repo: "example", deploymentId: 1, perPage: 1, accessToken: "tok", fetch: viaStatus.fetchFn }) as { statuses: unknown[] };
    expect(page.items.map((i) => [i.latestStatusState, i.latestStatus])).toEqual([["success", status.statuses[0]], [null, null]]);
    expect(page.items.map(({ latestStatus: _l, latestStatusState: _s, ...rest }) => rest)).toEqual(listed.deployments as Record<string, unknown>[]);
  });

  test("deployments.sync caps perPage at 30 and rejects a status without a state", async () => {
    await expect(executeDeploymentsSync({ owner: "o", repo: "r", perPage: 31, accessToken: "t" })).rejects.toThrow("1 to 30");
    const route = (async (url: string) => new Response(JSON.stringify(String(url).includes("/statuses") ? [{ id: 5 }] : deploymentsFixture), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    await expect(executeDeploymentsSync({ owner: "octocat", repo: "example", accessToken: "t", fetch: route })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("WORKFLOW_RUN_ARTIFACT_ADDED narrows by the item's workflow_run.id", async () => {
    const { fetchFn } = mockFetch(artifactsFixture);
    const page = await executeArtifactsSync({ owner: "octo-org", repo: "octo-docs", accessToken: "t", fetch: fetchFn });
    const [a, b] = page.items;
    // The run filter is declarative (poll.triggerFilters) and applied by the platform emit path;
    // the item field it reads is the normalized runId.
    expect(a.runId).toBe(2332938);
    expect(b.runId).not.toBe(2332938);
    expect((ops["actions.artifacts.sync"].poll as Record<string, unknown>).triggerFilters).toEqual({
      GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED: { itemField: "runId", inputField: "runId" },
    });
  });

  test("an item without a provider id fails instead of polling on a defaulted id", async () => {
    const broken = { total_count: 1, artifacts: [{ name: "no-id" }] };
    const { fetchFn } = mockFetch(broken);
    await expect(executeArtifactsSync({ owner: "o", repo: "r", accessToken: "t", fetch: fetchFn })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("credentials required; page and malformed cursors rejected; rate limit keeps retryAfter", async () => {
    await expect(executeFollowersSync({})).rejects.toThrow("requires connection credentials");
    await expect(executeFollowersSync({ accessToken: "t", page: 2 })).rejects.toThrow("cursor");
    for (const cursor of ["0", "abc", "1e3", 7]) {
      await expect(executeFollowersSync({ accessToken: "t", cursor })).rejects.toThrow("cursor must be");
    }
    const { fetchFn } = mockFetch({ message: "rate" }, undefined, 429, { "retry-after": "120" });
    await expect(executeWorkflowsSync({ owner: "o", repo: "r", accessToken: "t", fetch: fetchFn })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 120 });
  });
});

describe("legacy list syncs fetch live with credentials", () => {
  test("issues.list: request, PR filtering, cursor round trip", async () => {
    const raw = issuesFixture as unknown[];
    const first = mockFetch(raw, NEXT(2, "/repos/o/r/issues"));
    const page = await executeIssuesListSync({ owner: "o", repo: "r", state: "all", sort: "updated", accessToken: "t", fetch: first.fetchFn }) as { items: unknown[]; cursor: string | null };
    expect(first.calls[0].url).toBe("https://api.github.com/repos/o/r/issues?state=all&sort=updated&per_page=100");
    expect(page.items.length).toBe(2);
    expect(page.cursor).toBe("2");
    const second = mockFetch([]);
    const last = await executeIssuesListSync({ owner: "o", repo: "r", accessToken: "t", fetch: second.fetchFn, cursor: page.cursor }) as { items: unknown[]; cursor: string | null };
    expect(second.calls[0].url).toBe("https://api.github.com/repos/o/r/issues?per_page=100&page=2");
    expect(last).toEqual({ provider: "github", operation: "issues.list", items: [], cursor: null });
  });

  test("pull_requests.list, commits.list, repositories.list paths", async () => {
    const pr = mockFetch([{ id: 1, number: 2, title: "t" }]);
    expect(((await executePullRequestsListSync({ owner: "o", repo: "r", state: "open", accessToken: "t", fetch: pr.fetchFn })) as { items: unknown[] }).items.length).toBe(1);
    expect(pr.calls[0].url).toBe("https://api.github.com/repos/o/r/pulls?state=open&per_page=100");
    const commits = mockFetch([{ sha: "abc" }]);
    await executeCommitsListSync({ owner: "o", repo: "r", sha: "main", since: "2026-01-01T00:00:00Z", accessToken: "t", fetch: commits.fetchFn });
    expect(commits.calls[0].url).toBe("https://api.github.com/repos/o/r/commits?sha=main&since=2026-01-01T00%3A00%3A00Z&per_page=100");
    const repos = mockFetch([{ id: 9, name: "n", full_name: "o/n" }], NEXT(4, "/user/repos"));
    const page = await executeRepositoriesListSync({ sort: "pushed", perPage: 30, accessToken: "t", fetch: repos.fetchFn }) as { cursor: string | null };
    expect(repos.calls[0].url).toBe("https://api.github.com/user/repos?sort=pushed&per_page=30");
    expect(page.cursor).toBe("4");
  });

  test("bad filters and path segments are rejected before any request", () => {
    expect(() => executeIssuesListSync({ owner: "o/x", repo: "r", accessToken: "t" })).toThrow("single path segment");
    expect(() => executeIssuesListSync({ owner: "o", repo: "r", state: "merged", accessToken: "t" })).toThrow("state must be one of");
    expect(() => executeCommitsListSync({ owner: "o", repo: "r", perPage: 101, accessToken: "t" })).toThrow("perPage");
    expect(() => executeRepositoriesListSync({ page: 2, accessToken: "t" })).toThrow("cursor");
  });

  test("offline response mode is unchanged", () => {
    const result = executeIssuesListSync({ response: issuesFixture }) as { nextLink: string | null; items: unknown[] };
    expect(result.items.length).toBe(2);
    expect("cursor" in result).toBe(false);
  });
});
