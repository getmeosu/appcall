import { describe, expect, test } from "bun:test";
import createIssueFixture from "../fixtures/create_issue.json";
import { getIssue, updateIssue, addIssueLabels } from "../src/actions";

describe("github issues extended actions", () => {
  // ─── issues.get ───────────────────────────────────────────────────────────

  test("getIssue validates input and marks connector-owned output", () => {
    const result = getIssue({ owner: "acme", repo: "app", issueNumber: 50 });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("issues.get");
    expect((result.validated as Record<string, unknown>).issueNumber).toBe(50);
  });

  test("getIssue missing issueNumber throws validation error", () => {
    expect(() => getIssue({ owner: "acme", repo: "app" })).toThrow("issueNumber must be a number");
  });

  test("getIssue fetches from GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await getIssue({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(createIssueFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/issues/50");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("issues.get");
    expect((result.issue as Record<string, unknown>).number).toBe(50);
  });

  test("getIssue maps 404 to upstream error", async () => {
    await expect(
      getIssue({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        issueNumber: 9999,
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("getIssue maps 429 to rate limit error", async () => {
    await expect(
      getIssue({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        issueNumber: 1,
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "60" },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  // ─── issues.update ────────────────────────────────────────────────────────

  test("updateIssue validates input and marks connector-owned output", () => {
    const result = updateIssue({ owner: "acme", repo: "app", issueNumber: 50, title: "Updated Title" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("issues.update");
    expect((result.validated as Record<string, unknown>).title).toBe("Updated Title");
    expect((result.validated as Record<string, unknown>).issueNumber).toBe(50);
  });

  test("updateIssue patches GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const updatedFixture = { ...createIssueFixture, title: "Updated Title", state: "closed" };
    const result = await updateIssue({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      title: "Updated Title",
      state: "closed",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(updatedFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/issues/50");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    const body = JSON.parse(await requests[0].text());
    expect(body.title).toBe("Updated Title");
    expect(body.state).toBe("closed");
    expect(result.action).toBe("issues.update");
    expect((result.issue as Record<string, unknown>).title).toBe("Updated Title");
  });

  test("updateIssue maps upstream error on 500", async () => {
    await expect(
      updateIssue({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        issueNumber: 50,
        fetch: async () => new Response(JSON.stringify({ message: "Internal Error" }), { status: 500 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  // ─── issues.labels.add ────────────────────────────────────────────────────

  test("addIssueLabels validates input and marks connector-owned output", () => {
    const result = addIssueLabels({ owner: "acme", repo: "app", issueNumber: 50, labels: ["bug", "help wanted"] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("issues.labels.add");
    expect((result.validated as Record<string, unknown>).labels).toEqual(["bug", "help wanted"]);
  });

  test("addIssueLabels missing labels throws validation error", () => {
    expect(() => addIssueLabels({ owner: "acme", repo: "app", issueNumber: 50 })).toThrow("labels must be a non-empty array");
  });

  test("addIssueLabels empty labels array throws validation error", () => {
    expect(() =>
      addIssueLabels({ owner: "acme", repo: "app", issueNumber: 50, labels: [] })
    ).toThrow("labels must be a non-empty array");
  });

  test("addIssueLabels posts to GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const labelsResponse = [
      { id: 1, name: "bug", color: "d73a4a" },
      { id: 2, name: "help wanted", color: "0075ca" },
    ];
    const result = await addIssueLabels({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      issueNumber: 50,
      labels: ["bug", "help wanted"],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(labelsResponse), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/issues/50/labels");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    const body = JSON.parse(await requests[0].text());
    expect(body.labels).toEqual(["bug", "help wanted"]);
    expect(result.action).toBe("issues.labels.add");
    expect(result.labels).toEqual(["bug", "help wanted"]);
  });

  test("addIssueLabels maps 404 to upstream error", async () => {
    await expect(
      addIssueLabels({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        issueNumber: 9999,
        labels: ["bug"],
        fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
