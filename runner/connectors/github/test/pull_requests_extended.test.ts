import { describe, expect, test } from "bun:test";
import createPrFixture from "../fixtures/create_pr.json";
import prFilesFixture from "../fixtures/pr_files.json";
import { getPullRequest, updatePullRequest, listPullRequestFiles } from "../src/actions";

describe("github pull requests extended actions", () => {
  // ─── pull_requests.get ────────────────────────────────────────────────────

  test("getPullRequest validates input and marks connector-owned output", () => {
    const result = getPullRequest({ owner: "acme", repo: "app", pullNumber: 20 });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("pull_requests.get");
    expect((result.validated as Record<string, unknown>).pullNumber).toBe(20);
  });

  test("getPullRequest missing pullNumber throws validation error", () => {
    expect(() => getPullRequest({ owner: "acme", repo: "app" })).toThrow("pullNumber must be a number");
  });

  test("getPullRequest fetches from GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await getPullRequest({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(createPrFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/20");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("pull_requests.get");
    expect((result.pullRequest as Record<string, unknown>).number).toBe(20);
  });

  test("getPullRequest maps 404 to upstream error", async () => {
    await expect(
      getPullRequest({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 9999,
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("getPullRequest maps 429 to rate limit error", async () => {
    await expect(
      getPullRequest({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 20,
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "60" },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  // ─── pull_requests.update ─────────────────────────────────────────────────

  test("updatePullRequest validates input and marks connector-owned output", () => {
    const result = updatePullRequest({ owner: "acme", repo: "app", pullNumber: 20, title: "Updated PR Title" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("pull_requests.update");
    expect((result.validated as Record<string, unknown>).title).toBe("Updated PR Title");
    expect((result.validated as Record<string, unknown>).pullNumber).toBe(20);
  });

  test("updatePullRequest patches GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const updatedFixture = { ...createPrFixture, title: "Updated PR Title", state: "closed" };
    const result = await updatePullRequest({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      title: "Updated PR Title",
      state: "closed",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(updatedFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/pulls/20");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    const body = JSON.parse(await requests[0].text());
    expect(body.title).toBe("Updated PR Title");
    expect(body.state).toBe("closed");
    expect(result.action).toBe("pull_requests.update");
  });

  test("updatePullRequest maps upstream error on 404", async () => {
    await expect(
      updatePullRequest({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 9999,
        title: "Update",
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  // ─── pull_requests.list_files ─────────────────────────────────────────────

  test("listPullRequestFiles validates input and marks connector-owned output", () => {
    const result = listPullRequestFiles({ owner: "acme", repo: "app", pullNumber: 20 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("pull_requests.list_files");
    expect((result.validated as Record<string, unknown>).pullNumber).toBe(20);
  });

  test("listPullRequestFiles fetches from GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await listPullRequestFiles({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      pullNumber: 20,
      perPage: 30,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(prFilesFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/repos/acme/app/pulls/20/files");
    expect(requests[0].url).toContain("per_page=30");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("pull_requests.list_files");
    expect(Array.isArray(result.files)).toBe(true);
    expect((result.files as unknown[]).length).toBe(2);
    const firstFile = (result.files as Record<string, unknown>[])[0];
    expect(firstFile.filename).toBe("src/index.ts");
    expect(firstFile.status).toBe("modified");
    expect(firstFile.additions).toBe(10);
    expect(firstFile.deletions).toBe(2);
  });

  test("listPullRequestFiles maps 422 to upstream error (too large)", async () => {
    await expect(
      listPullRequestFiles({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 20,
        fetch: async () =>
          new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("listPullRequestFiles maps 429 to rate limit error", async () => {
    await expect(
      listPullRequestFiles({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        pullNumber: 20,
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "30" },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});
