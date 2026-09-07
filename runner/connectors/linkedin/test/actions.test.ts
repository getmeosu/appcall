import { describe, expect, it } from "bun:test";
import { createPost } from "../src/actions";
import createPostFixture from "../fixtures/create_post.json";

function createMockFetch(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("createPost action", () => {
  it("validates input without accessToken", () => {
    const result = createPost({ text: "Hello world", visibility: "PUBLIC" });
    expect(result.connector).toBe("linkedin");
    expect(result.action).toBe("posts.create");
    expect((result as any).validated.text).toBe("Hello world");
  });

  it("throws when text is missing", () => {
    expect(() => createPost({ visibility: "PUBLIC" })).toThrow("text is required");
  });

  it("throws for non-object input", () => {
    expect(() => createPost("not an object")).toThrow("create post input must be an object");
  });

  it("creates post with accessToken", async () => {
    const fetch = createMockFetch(201, createPostFixture);
    const result = await createPost({ accessToken: "test-token", text: "Hello from the connector!", authorUrn: "urn:li:person:abc123def", fetch });
    expect(result.connector).toBe("linkedin");
    expect(result.action).toBe("posts.create");
    expect((result as any).post.id).toBe("li-post:999888777");
    expect((result as any).post.text).toBe("Hello from the connector!");
  });
});
