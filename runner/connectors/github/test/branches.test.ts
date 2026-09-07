import { describe, expect, test } from "bun:test";
import getBranchFixture from "../fixtures/get_branch.json";
import createBranchFixture from "../fixtures/create_branch.json";
import { getBranch, createBranch } from "../src/actions";

describe("github branches actions", () => {
  // ─── branches.get ─────────────────────────────────────────────────────────

  test("getBranch validates input and marks connector-owned output", () => {
    const result = getBranch({ owner: "acme", repo: "app", branch: "main" });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("branches.get");
    expect(result.validated).toEqual({ owner: "acme", repo: "app", branch: "main" });
  });

  test("getBranch missing branch throws validation error", () => {
    expect(() => getBranch({ owner: "acme", repo: "app" })).toThrow("branch is required");
  });

  test("getBranch fetches from GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await getBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "feature/new-api",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(getBranchFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/repos/acme/app/branches/");
    expect(requests[0].url).toContain("feature");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("branches.get");
    expect((result.branch as Record<string, unknown>).name).toBe("feature/new-api");
    expect((result.branch as Record<string, unknown>).sha).toBe("abc123def456abc123def456abc123def456abc1");
    expect((result.branch as Record<string, unknown>).protected).toBe(false);
  });

  test("getBranch maps 404 to upstream error", async () => {
    await expect(
      getBranch({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        branch: "nonexistent",
        fetch: async () => new Response(JSON.stringify({ message: "Branch not found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("getBranch maps 403 rate limit to CONNECTOR_RATE_LIMITED", async () => {
    const resetTime = Math.floor(Date.now() / 1000) + 120;
    await expect(
      getBranch({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        branch: "main",
        fetch: async () =>
          new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
            status: 403,
            headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetTime) },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  // ─── branches.create ──────────────────────────────────────────────────────

  test("createBranch validates input and marks connector-owned output", () => {
    const result = createBranch({
      owner: "acme",
      repo: "app",
      branch: "feature/my-feature",
      sha: "abc123def456abc123def456abc123def456abc1",
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("branches.create");
    expect((result.validated as Record<string, unknown>).branch).toBe("feature/my-feature");
    expect((result.validated as Record<string, unknown>).sha).toBe("abc123def456abc123def456abc123def456abc1");
  });

  test("createBranch missing sha throws validation error", () => {
    expect(() => createBranch({ owner: "acme", repo: "app", branch: "feat" })).toThrow("sha is required");
  });

  test("createBranch posts to /git/refs with correct auth", async () => {
    const requests: Request[] = [];
    const result = await createBranch({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      branch: "feature/new-api",
      sha: "abc123def456abc123def456abc123def456abc1",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(createBranchFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/git/refs");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    const body = JSON.parse(await requests[0].text());
    expect(body.ref).toBe("refs/heads/feature/new-api");
    expect(body.sha).toBe("abc123def456abc123def456abc123def456abc1");
    expect(result.action).toBe("branches.create");
    expect((result.branch as Record<string, unknown>).name).toBe("feature/new-api");
  });

  test("createBranch maps 422 to upstream error", async () => {
    await expect(
      createBranch({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        branch: "existing-branch",
        sha: "abc123",
        fetch: async () =>
          new Response(JSON.stringify({ message: "Reference already exists" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
