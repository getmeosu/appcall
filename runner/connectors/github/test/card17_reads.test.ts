import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import rateLimitFixture from "../fixtures/rate_limit.json";
import commentsFixture from "../fixtures/repo_comments.json";
import keyFixture from "../fixtures/repo_key.json";
import keysFixture from "../fixtures/repo_keys.json";
import {
  getRateLimit,
  listRepoComments,
  getRepoKey,
  listRepoKeys,
} from "../src/actions";
import {
  validateGetRateLimitInput,
  validateListRepoCommentsInput,
  validateGetRepoKeyInput,
  validateListRepoKeysInput,
} from "../src/card17_reads";

const READS = [
  "rate_limit.get",
  "repos.comments.list",
  "repos.keys.get",
  "repos.keys.list",
] as const;

describe("github card-17 reads", () => {
  test("manifest stays v0.48.0 at 489 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.48.0");
    expect(Object.keys(manifest.operations).length).toBe(489);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op).not.toHaveProperty("effectPolicy");
      expect(op).not.toHaveProperty("reconcile");
    }
    expect(manifest.operations["users.keys.list"]).toBeDefined();
    expect(manifest.operations["commits.comments.list"]).toBeDefined();
    expect(manifest.operations["repos.issues.comments.list"]).toBeDefined();
    expect(manifest.operations["commits.comments.get"]).toBeDefined();
    expect(manifest.operations["repos.comments.get"]).toBeUndefined();
    expect(manifest.operations["users.keys.get"]).toBeUndefined();
  });

  test("validates path fields and documented pagination only", () => {
    expect(validateGetRateLimitInput({})).toEqual({});
    expect(validateGetRateLimitInput(undefined)).toEqual({});
    expect(() => validateGetRateLimitInput("nope")).toThrow(/rate_limit.get/);
    expect(validateListRepoCommentsInput({ owner: "octocat", repo: "Hello-World", perPage: 30, page: 2 })).toEqual({
      owner: "octocat", repo: "Hello-World", perPage: 30, page: 2,
    });
    expect(validateListRepoCommentsInput({ owner: "octocat", repo: "Hello-World" })).not.toHaveProperty("since");
    expect(() => validateListRepoCommentsInput({ owner: "octo/cat", repo: "Hello-World" })).toThrow(/owner/);
    expect(() => validateListRepoCommentsInput({ owner: "octocat", repo: "Hello-World", perPage: 101 })).toThrow(/perPage/);
    expect(validateGetRepoKeyInput({ owner: "octocat", repo: "Hello-World", keyId: 7 })).toEqual({
      owner: "octocat", repo: "Hello-World", keyId: 7,
    });
    expect(() => validateGetRepoKeyInput({ owner: "octocat", repo: "Hello-World", keyId: 0 })).toThrow(/keyId/);
    expect(() => validateGetRepoKeyInput({ owner: "octocat", repo: "a/b", keyId: 1 })).toThrow(/repo/);
    expect(validateListRepoKeysInput({ owner: "octocat", repo: "Hello-World", perPage: 30, page: 2 })).toEqual({
      owner: "octocat", repo: "Hello-World", perPage: 30, page: 2,
    });
    expect(() => validateListRepoKeysInput({ owner: "octocat", repo: "Hello-World", page: 0 })).toThrow(/page/);
  });

  test("gets the authenticated rate limit from GET /rate_limit", async () => {
    const result = await getRateLimit({
      accessToken: "t",
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/rate_limit");
        expect(url).not.toContain("?");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(rateLimitFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("rate_limit.get");
    expect(result.rateLimit).toMatchObject({ limit: 5000, remaining: 4999, reset: 1372700873, used: 1 });

    await expect(getRateLimit({
      accessToken: "t",
      fetch: async () => new Response(null, { status: 204 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("lists repository comments, not commit-scoped comments", async () => {
    const listed = await listRepoComments({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/comments?per_page=30&page=2");
        expect(url).not.toContain("/commits/");
        expect(url).not.toContain("/issues/");
        expect(url).not.toContain("since=");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(commentsFixture), { status: 200 });
      },
    });
    expect(listed.action).toBe("repos.comments.list");
    expect((listed.comments as { id: number; userLogin: string; commitId: string }[])[0]).toMatchObject({
      id: 1,
      userLogin: "octocat",
      commitId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });

  test("gets and lists repository keys, not user keys", async () => {
    const one = await getRepoKey({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      keyId: 7,
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/keys/7");
        expect(url).not.toContain("/users/");
        expect(init?.method ?? "GET").toBe("GET");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(keyFixture), { status: 200 });
      },
    });
    expect(one.action).toBe("repos.keys.get");
    expect(one.key).toMatchObject({ id: 1, key: "not-a-public-key", title: "octocat", readOnly: true });

    const listed = await listRepoKeys({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      perPage: 30,
      page: 2,
      fetch: async (input) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/repos/octocat/Hello-World/keys?per_page=30&page=2");
        expect(url).not.toMatch(/\/keys\/\d+/);
        expect(url).not.toContain("/users/");
        return new Response(JSON.stringify(keysFixture), { status: 200 });
      },
    });
    expect(listed.action).toBe("repos.keys.list");
    expect((listed.keys as { key: string }[])[0].key).toBe("not-a-public-key");
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getRateLimit({
      accessToken: "t",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = () => new Response("{}", { status: 404 });
    await expect(getRateLimit({ accessToken: "t", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoComments({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getRepoKey({ accessToken: "t", owner: "octocat", repo: "Hello-World", keyId: 1, fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoKeys({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = getRepoKey({ owner: "octocat", repo: "Hello-World", keyId: 7 });
    expect(result.action).toBe("repos.keys.get");
    expect(result.validated).toEqual({ owner: "octocat", repo: "Hello-World", keyId: 7 });
    const rate = getRateLimit({});
    expect(rate.action).toBe("rate_limit.get");
    expect(rate.validated).toEqual({});
  });
});
