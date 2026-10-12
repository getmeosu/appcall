import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import releasesFixture from "../fixtures/trig3b/releases.json";
import notificationsFixture from "../fixtures/trig3b/notifications.json";
import readmeFixture from "../fixtures/trig3b/readme.json";
import commitsFixture from "../fixtures/trig3b/commits.json";
import { executeContentsSync, executeReadmeSync, executeReleaseAssetsSync, executeRepoNotificationsSync } from "../src/sync";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

type Call = { url: string; method: string };
const ops = manifest.operations as Record<string, Record<string, unknown>>;

function mockFetch(body: unknown, status = 200, link?: string) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET" });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(link ? { link } : {}) } });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const base = { owner: "octocat", repo: "Hello-World", accessToken: "tok" };

const POLLING = {
  "releases.assets.sync": { versionKey: undefined, onNew: ["GITHUB_RELEASE_ASSET_ADDED_TRIGGER"], onChanged: undefined, inputs: ["owner", "perPage", "repo"] },
  "repos.notifications.sync": { versionKey: "updatedAt", onNew: ["GITHUB_REPOSITORY_NOTIFICATION_RECEIVED_TRIGGER"], onChanged: ["GITHUB_REPOSITORY_NOTIFICATION_RECEIVED_TRIGGER"], inputs: ["all", "owner", "participating", "perPage", "repo"] },
  "repos.readme.sync": { versionKey: "sha", onNew: ["GITHUB_README_CHANGED_TRIGGER"], onChanged: ["GITHUB_README_CHANGED_TRIGGER"], inputs: ["owner", "ref", "repo"] },
  "repos.contents.sync": { versionKey: undefined, onNew: ["GITHUB_REPOSITORY_CONTENT_CHANGED_TRIGGER"], onChanged: undefined, inputs: ["owner", "path", "perPage", "repo", "sha"] },
} as const;

describe("TRIG-3b manifest", () => {
  test("the four TRIG-3b syncs declare poll with the audit's triggers", () => {
    expect(manifest.version).toBe("0.89.8");
    for (const [key, want] of Object.entries(POLLING)) {
      const op = ops[key];
      const poll = op.poll as Record<string, unknown>;
      expect(op.kind).toBe("sync");
      expect(poll.itemKey).toBe("id");
      expect(poll.versionKey).toBe(want.versionKey);
      expect(poll.onNew).toEqual(want.onNew);
      expect(poll.onChanged).toEqual(want.onChanged);
      const schema = op.inputSchema as { properties: object; additionalProperties: boolean; required?: string[] };
      expect(schema.additionalProperties).toBe(false);
      expect(Object.keys(schema.properties).sort()).toEqual([...want.inputs]);
    }
    expect((ops["repos.contents.sync"].inputSchema as { required: string[] }).required).toContain("path");
    const polled = Object.values(ops).filter((op) => op.poll !== undefined);
    expect(polled.length).toBe(8);
    const slugs = new Set(polled.flatMap((op) => [...((op.poll as { onNew?: string[] }).onNew ?? []), ...((op.poll as { onChanged?: string[] }).onChanged ?? [])]));
    expect(slugs.size).toBe(9);
  });

  test("the TS registry dispatches the four syncs", async () => {
    const described = defaultConnectorRegistry.describe("github") as { operations: Record<string, Record<string, unknown>> };
    for (const key of Object.keys(POLLING)) expect(described.operations[key].poll).toEqual(ops[key].poll);
    const { fetchFn } = mockFetch(readmeFixture);
    const result = defaultConnectorRegistry.executeSync("github", "repos.readme.sync", { ...base, fetch: fetchFn });
    expect(result.ok).toBe(true);
    const output = await Promise.resolve((result as { output: unknown }).output) as { items: unknown[] };
    expect(output.items.length).toBe(1);
  });
});

describe("TRIG-3b syncs", () => {
  test("releases.assets.sync flattens assets of the newest releases", async () => {
    const { calls, fetchFn } = mockFetch(releasesFixture);
    const page = await executeReleaseAssetsSync({ ...base, fetch: fetchFn });
    expect(calls[0].url).toBe("https://api.github.com/repos/octocat/Hello-World/releases?per_page=10");
    expect(page.items.map((i) => i.id)).toEqual(["gh-release-asset:11", "gh-release-asset:12", "gh-release-asset:10"]);
    expect(page.items[2].release).toEqual({ providerReleaseId: 1, tagName: "v1.0.0" });
    expect(page.cursor).toBeNull();
    await expect(executeReleaseAssetsSync({ ...base, perPage: 31, fetch: fetchFn })).rejects.toThrow();
    await expect(executeReleaseAssetsSync({ ...base, fetch: mockFetch([{ id: 3, tag_name: "v2" }]).fetchFn })).rejects.toThrow("assets");
  });

  test("repos.notifications.sync keys threads with updatedAt and rejects since/before", async () => {
    const { calls, fetchFn } = mockFetch(notificationsFixture);
    const page = await executeRepoNotificationsSync({ ...base, fetch: fetchFn });
    expect(calls[0].url.startsWith("https://api.github.com/repos/octocat/Hello-World/notifications?")).toBe(true);
    expect(page.items.map((i) => [i.id, i.updatedAt])).toEqual([["gh-notification:1", "2026-10-10T00:00:00Z"], ["gh-notification:2", "2026-10-09T00:00:00Z"]]);
    await expect(executeRepoNotificationsSync({ ...base, since: "2026-01-01T00:00:00Z", fetch: fetchFn })).rejects.toThrow("since");
    await expect(executeRepoNotificationsSync({ ...base, before: "2026-01-01T00:00:00Z", fetch: fetchFn })).rejects.toThrow("before");
  });

  test("repos.notifications.sync maps GitHub's token-type 403 to CONNECTOR_CAPABILITY_MISSING", async () => {
    const forbidden = (headers: Record<string, string>) =>
      (async () => new Response(JSON.stringify({ message: "Resource not accessible by personal access token" }), { status: 403, headers: { "content-type": "application/json", ...headers } })) as unknown as typeof fetch;
    // Fine-grained PAT / GitHub App token: GitHub sends no X-OAuth-Scopes.
    await expect(executeRepoNotificationsSync({ ...base, fetch: forbidden({}) })).rejects.toMatchObject({
      ok: false, code: "CONNECTOR_CAPABILITY_MISSING", status: 403, reason: "unsupported_token",
      missingScopes: [], requiredScopes: ["notifications"], reconsentRequired: false,
      providerError: { message: "Resource not accessible by personal access token" },
    });
    // OAuth / classic token without the notifications scope: re-consent fixes it.
    await expect(executeRepoNotificationsSync({ ...base, fetch: forbidden({ "x-oauth-scopes": "repo, gist" }) })).rejects.toMatchObject({
      code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing",
      missingScopes: ["notifications"], requiredScopes: ["notifications"], reconsentRequired: true,
    });
    // The scope is granted: not a capability problem, the provider error stands.
    const other = executeRepoNotificationsSync({ ...base, fetch: forbidden({ "x-oauth-scopes": "repo, notifications" }) });
    await expect(other).rejects.toBeDefined();
    await other.catch((error) => expect((error as { code?: string }).code).not.toBe("CONNECTOR_CAPABILITY_MISSING"));
  });

  test("repos.readme.sync yields one constant-key item without content; 404 yields none", async () => {
    const { calls, fetchFn } = mockFetch(readmeFixture);
    const page = await executeReadmeSync({ ...base, fetch: fetchFn });
    expect(calls[0].url.startsWith("https://api.github.com/repos/octocat/Hello-World/readme")).toBe(true);
    expect(page.items.length).toBe(1);
    expect(page.items[0].id).toBe("readme");
    expect(page.items[0].sha).toBe("3d21ec53a331a6f037a91c368710b99387d012c1");
    expect("content" in page.items[0]).toBe(false);
    expect(page.cursor).toBeNull();
    const missing = await executeReadmeSync({ ...base, fetch: mockFetch({ message: "Not Found" }, 404).fetchFn });
    expect(missing.items).toEqual([]);
    await expect(executeReadmeSync({ ...base, fetch: mockFetch({ message: "boom" }, 500).fetchFn })).rejects.toBeDefined();
    await expect(executeReadmeSync({ ...base, cursor: "2", fetch: fetchFn })).rejects.toThrow("cursor");
  });

  test("repos.contents.sync requires path and keys commits by sha", async () => {
    const { calls, fetchFn } = mockFetch(commitsFixture);
    const page = await executeContentsSync({ ...base, path: "docs", fetch: fetchFn });
    expect(new URL(calls[0].url).pathname).toBe("/repos/octocat/Hello-World/commits");
    expect(new URL(calls[0].url).searchParams.get("path")).toBe("docs");
    expect(page.items.map((i) => i.id)).toEqual(["gh-commit:6dcb09b5b57875f334f61aebed695e2e4193db5e", "gh-commit:7638417db6d59f3c431d3e1f261cc637155684cd"]);
    expect(() => executeContentsSync({ ...base, fetch: fetchFn })).toThrow("path");
    await expect(executeContentsSync({ ...base, path: "docs", fetch: mockFetch([{ sha: "abc" }]).fetchFn })).rejects.toThrow();
  });
});
