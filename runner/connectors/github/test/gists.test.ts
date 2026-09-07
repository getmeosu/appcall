import { describe, expect, test } from "bun:test";
import createGistFixture from "../fixtures/create_gist.json";
import { createGist } from "../src/actions";

describe("github gists actions", () => {
  // ─── gists.create ─────────────────────────────────────────────────────────

  test("createGist validates input and marks connector-owned output", () => {
    const result = createGist({
      description: "Hello World Examples",
      public: true,
      files: [{ filename: "hello_world.rb", content: "puts 'Hello World'" }],
    });
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("gists.create");
    const validated = result.validated as Record<string, unknown>;
    expect(validated.description).toBe("Hello World Examples");
    expect(validated.public).toBe(true);
    expect(Array.isArray(validated.files)).toBe(true);
  });

  test("createGist missing files throws validation error", () => {
    expect(() => createGist({ description: "no files" })).toThrow("files is required");
  });

  test("createGist with empty files array throws validation error", () => {
    expect(() => createGist({ files: [] })).toThrow("files is required");
  });

  test("createGist file missing content throws validation error", () => {
    expect(() =>
      createGist({ files: [{ filename: "test.rb" }] })
    ).toThrow("file.content is required");
  });

  test("createGist posts to /gists with correct URL and auth", async () => {
    const requests: Request[] = [];
    const result = await createGist({
      accessToken: "ghp_test-token",
      description: "Hello World Examples",
      public: true,
      files: [{ filename: "hello_world.rb", content: "puts 'Hello World'" }],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(JSON.stringify(createGistFixture), { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.github.com/gists");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ghp_test-token");
    const body = JSON.parse(await requests[0].text());
    expect(body.description).toBe("Hello World Examples");
    expect(body.public).toBe(true);
    expect(body.files["hello_world.rb"]).toBeDefined();
    expect(body.files["hello_world.rb"].content).toBe("puts 'Hello World'");
    expect(result.connector).toBe("github");
    expect(result.action).toBe("gists.create");
    const gist = result.gist as Record<string, unknown>;
    expect(gist.description).toBe("Hello World Examples");
    expect(gist.public).toBe(true);
    expect(Array.isArray(gist.fileNames)).toBe(true);
    expect((gist.fileNames as string[]).length).toBe(1);
    expect((gist.fileNames as string[])[0]).toBe("hello_world.rb");
  });

  test("createGist maps 429 to rate limit error", async () => {
    await expect(
      createGist({
        accessToken: "ghp_test-token",
        files: [{ filename: "test.txt", content: "hello" }],
        fetch: async () =>
          new Response(JSON.stringify({ message: "rate limited" }), {
            status: 429,
            headers: { "Retry-After": "45" },
          }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 45 });
  });

  test("createGist maps 422 to upstream error", async () => {
    await expect(
      createGist({
        accessToken: "ghp_test-token",
        files: [{ filename: "bad.txt", content: "some content" }],
        fetch: async () =>
          new Response(JSON.stringify({ message: "Validation Failed" }), { status: 422 }),
      })
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
