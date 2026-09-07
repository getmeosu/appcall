import { describe, expect, test } from "bun:test";
import createReleaseFixture from "../fixtures/create_release.json";
import { createRelease } from "../src/actions";

describe("github releases actions", () => {
  // ─── releases.create ──────────────────────────────────────────────────────

  test("createRelease validates input and marks connector-owned output", () => {
    const result = createRelease({ owner: "acme", repo: "app", tagName: "v1.0.0", name: "Version 1.0.0" });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("releases.create");
    expect((result.validated as Record<string, unknown>).tagName).toBe("v1.0.0");
    expect((result.validated as Record<string, unknown>).name).toBe("Version 1.0.0");
  });

  test("createRelease missing tagName throws validation error", () => {
    expect(() => createRelease({ owner: "acme", repo: "app" })).toThrow("tagName is required");
  });

  test("createRelease posts to GitHub API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await createRelease({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      tagName: "v1.0.0",
      name: "Version 1.0.0",
      body: "First stable release.",
      draft: false,
      prerelease: false,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(createReleaseFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/repos/acme/app/releases");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    const body = JSON.parse(await requests[0].text());
    expect(body.tag_name).toBe("v1.0.0");
    expect(body.name).toBe("Version 1.0.0");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("releases.create");
    const release = result.release as Record<string, unknown>;
    expect(release.tagName).toBe("v1.0.0");
    expect(release.draft).toBe(false);
    expect(release.url).toBe("https://github.com/acme/app/releases/tag/v1.0.0");
  });

  test("createRelease maps 422 to upstream error", async () => {
    await expect(
      createRelease({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        tagName: "v1.0.0",
        fetch: async () =>
          new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("createRelease maps 429 to rate limit error", async () => {
    await expect(
      createRelease({
        accessToken: "ghp_test-token",
        owner: "acme",
        repo: "app",
        tagName: "v2.0.0",
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "30" },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});
