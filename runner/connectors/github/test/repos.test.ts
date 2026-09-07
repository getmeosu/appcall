import { describe, expect, test } from "bun:test";
import getRepoFixture from "../fixtures/get_repo.json";
import { getRepo, createRepo, listRepos, getRepoContents } from "../src/actions";

describe("github repos actions", () => {
  // ─── repos.get ───────────────────────────────────────────────────────────────

  test("getRepo validates input and marks connector-owned output", () => {
    const result = getRepo({ owner: "acme", repo: "app" });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("repos.get");
    expect(result.validated).toEqual({ owner: "acme", repo: "app" });
  });

  test("getRepo missing owner throws validation error", () => {
    expect(() => getRepo({ repo: "app" })).toThrow("owner is required");
  });

  test("getRepo fetches from GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await getRepo({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(getRepoFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("repos.get");
    expect(result.source).toBe("connector");
    expect((result.repo as Record<string, unknown>).fullName).toBe("acme/app");
    expect((result.repo as Record<string, unknown>).stars).toBe(42);
  });

  test("getRepo maps 404 to upstream error", async () => {
    await expect(
      getRepo({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "missing",
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("getRepo maps 429 to rate limit error", async () => {
    await expect(
      getRepo({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "60" },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  // ─── repos.create ────────────────────────────────────────────────────────────

  test("createRepo validates input and marks connector-owned output", () => {
    const result = createRepo({ name: "my-new-repo", private: true });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("repos.create");
    expect((result.validated as Record<string, unknown>).name).toBe("my-new-repo");
    expect((result.validated as Record<string, unknown>).private).toBe(true);
  });

  test("createRepo missing name throws validation error", () => {
    expect(() => createRepo({ description: "no name" })).toThrow("name is required");
  });

  test("createRepo posts to /user/repos with correct auth", async () => {
    const requests: Request[] = [];
    const result = await createRepo({
      accessToken: "ghp_test-token",
      name: "my-new-repo",
      description: "A test repo",
      private: true,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify({ ...getRepoFixture, name: "my-new-repo", full_name: "acme/my-new-repo", private: true }), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/user/repos");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.action).toBe("repos.create");
    expect((result.repo as Record<string, unknown>).fullName).toBe("acme/my-new-repo");
  });

  test("createRepo maps 422 to upstream error", async () => {
    await expect(
      createRepo({
        accessToken: "ghp_test-token",
        name: "existing-repo",
        fetch: async () => new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  // ─── repos.list ──────────────────────────────────────────────────────────────

  test("listRepos validates input (no required fields)", () => {
    const result = listRepos({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("repos.list");
    expect(result.validated).toEqual({});
  });

  test("listRepos fetches from /user/repos", async () => {
    const requests: Request[] = [];
    const result = await listRepos({
      accessToken: "ghp_test-token",
      type: "owner",
      sort: "updated",
      perPage: 10,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify([getRepoFixture]), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/user/repos");
    expect(requests[0].url).toContain("type=owner");
    expect(requests[0].url).toContain("sort=updated");
    expect(requests[0].url).toContain("per_page=10");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.action).toBe("repos.list");
    expect(Array.isArray(result.repos)).toBe(true);
    expect((result.repos as unknown[]).length).toBe(1);
  });

  // ─── repos.contents.get ──────────────────────────────────────────────────────

  test("getRepoContents validates input", () => {
    const result = getRepoContents({ owner: "acme", repo: "app", path: "README.md" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("repos.contents.get");
    expect((result.validated as Record<string, unknown>).path).toBe("README.md");
  });

  test("getRepoContents fetches from /contents/{path}", async () => {
    const contentsFixture = {
      type: "file",
      encoding: "base64",
      size: 100,
      name: "README.md",
      path: "README.md",
      content: "IyBIZWxsbw==",
      sha: "abc123",
      html_url: "https://github.com/acme/app/blob/main/README.md",
    };
    const requests: Request[] = [];
    const result = await getRepoContents({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      path: "README.md",
      ref: "main",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(contentsFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/repos/acme/app/contents/README.md");
    expect(requests[0].url).toContain("ref=main");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.action).toBe("repos.contents.get");
    expect(result.contents).toBeDefined();
  });

  test("getRepoContents maps 404 to upstream error", async () => {
    await expect(
      getRepoContents({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        path: "not-found.md",
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
