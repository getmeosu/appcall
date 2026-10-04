import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import commentFixture from "../fixtures/gist_comment.json";
import forkFixture from "../fixtures/gist_fork.json";
import {
  createGistComment,
  updateGistComment,
  deleteGistComment,
  forkGist,
  starGist,
  unstarGist,
} from "../src/actions";
import {
  validateCreateGistCommentInput,
  validateUpdateGistCommentInput,
  validateDeleteGistCommentInput,
  validateForkGistInput,
  validateStarGistInput,
  validateUnstarGistInput,
} from "../src/card_gist_writes";

const RECONCILE = [
  ["gists.comments.create", "gists.comments.get"],
  ["gists.comments.update", "gists.comments.get"],
  ["gists.fork", "gists.get"],
] as const;

const IDEMPOTENT = ["gists.star"] as const;
const DESTRUCTIVE = ["gists.comments.delete", "gists.unstar"] as const;

const EXISTING = [
  "gists.create",
  "gists.get",
  "gists.list",
  "gists.update",
  "gists.star.check",
  "gists.comments.get",
  "gists.comments.list",
  "gists.forks.list",
] as const;

describe("github gist comment fork and star writes", () => {
  test("version is 0.44.0 at 430 ops and the write policies are wired", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(Object.keys(manifest.operations)).toHaveLength(430);
    for (const [key, reconcile] of RECONCILE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of IDEMPOTENT) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    for (const key of DESTRUCTIVE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("destructive");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    expect(String(manifest.operations["gists.unstar"].description)).toContain("404");
    expect(String(manifest.operations["gists.star"].description)).toContain("Idempotent");
    for (const key of EXISTING) {
      expect(manifest.operations[key]).toBeDefined();
    }
    expect(manifest.operations["gists.star.check"].sideEffect).toBe("read");
    expect(manifest.operations["gists.star.check"].effectPolicy).toBeUndefined();
    expect(manifest.operations["gists.comments.create"]).toBeDefined();
    expect(manifest.operations["gists.forks.create"]).toBeUndefined();
  });

  test("comments.create POSTs the body and drops extra fields", async () => {
    const dry = createGistComment({ gistId: "aa5a315d61ae9438b18d", body: "hello" });
    expect(dry.action).toBe("gists.comments.create");
    expect(dry.validated).toEqual({ gistId: "aa5a315d61ae9438b18d", body: "hello" });
    const requests: Request[] = [];
    const result = await createGistComment({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      body: "hello",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(commentFixture, 201);
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/gists/aa5a315d61ae9438b18d/comments");
    expect(requests[0].headers.get("authorization")).toBe("Bearer t");
    expect(requests[0].headers.get("accept")).toBe("application/vnd.github+json");
    expect(JSON.parse(await requests[0].text())).toEqual({ body: "hello" });
    expect(result.comment).toEqual({
      id: 1,
      body: "Just commenting for the sake of commenting",
      user: "octocat",
      createdAt: "2011-04-18T23:23:56Z",
    });
    expect(JSON.stringify(result.comment)).not.toContain("drop-me");
  });

  test("comments.update PATCHes and comments.delete is 204 with 404 as upstream", async () => {
    const requests: Request[] = [];
    const updated = await updateGistComment({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      commentId: 1,
      body: "edited",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(commentFixture, 200);
      },
    });
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].url).toBe("https://api.github.com/gists/aa5a315d61ae9438b18d/comments/1");
    expect(JSON.parse(await requests[0].text())).toEqual({ body: "edited" });
    expect((updated.comment as Record<string, unknown>).id).toBe(1);

    const deleted = await deleteGistComment({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      commentId: 1,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[1].method).toBe("DELETE");
    expect(requests[1].url).toBe("https://api.github.com/gists/aa5a315d61ae9438b18d/comments/1");
    expect(deleted.deleted).toBe(true);
    expect(deleted.commentId).toBe(1);
    expect(deleted.gistId).toBe("aa5a315d61ae9438b18d");
    await expect(deleteGistComment({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      commentId: 1,
      fetch: async () => json({ message: "Not Found" }, 404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("fork POSTs /gists/{gist_id}/forks and returns the forked gist", async () => {
    const requests: Request[] = [];
    const result = await forkGist({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return json(forkFixture, 201);
      },
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.github.com/gists/aa5a315d61ae9438b18d/forks");
    expect(result.gist).toEqual({
      id: "forked315d61ae9438b18d",
      description: "Hello World Examples",
      public: true,
      owner: "hubot",
    });
    expect(JSON.stringify(result.gist)).not.toContain("drop-me");
  });

  test("star is PUT with Content-Length 0 and unstar treats 404 as already unstarred", async () => {
    const requests: Request[] = [];
    const starred = await starGist({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.github.com/gists/aa5a315d61ae9438b18d/star");
    expect(requests[0].url).not.toContain("/gists/starred");
    expect(requests[0].headers.get("content-length")).toBe("0");
    expect(starred.starred).toBe(true);
    expect(starred.gistId).toBe("aa5a315d61ae9438b18d");

    const unstarred = await unstarGist({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[1].method).toBe("DELETE");
    expect(requests[1].url).toBe("https://api.github.com/gists/aa5a315d61ae9438b18d/star");
    expect(unstarred.starred).toBe(false);

    const already = await unstarGist({
      accessToken: "t",
      gistId: "aa5a315d61ae9438b18d",
      fetch: async () => new Response("", { status: 404 }),
    });
    expect(already.starred).toBe(false);
    expect(already.gistId).toBe("aa5a315d61ae9438b18d");

    await expect(starGist({
      accessToken: "t",
      gistId: "missing",
      fetch: async () => json({ message: "Not Found" }, 404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("path segments stay single and a 429 is CONNECTOR_RATE_LIMITED", async () => {
    expect(validateCreateGistCommentInput({ gistId: "abc", body: "hi" })).toEqual({ gistId: "abc", body: "hi" });
    expect(validateCreateGistCommentInput({ gist_id: "abc", body: "hi" })).toEqual({ gistId: "abc", body: "hi" });
    expect(validateUpdateGistCommentInput({ gistId: "abc", commentId: 4, body: "x" })).toEqual({
      gistId: "abc",
      commentId: 4,
      body: "x",
    });
    expect(validateDeleteGistCommentInput({ gistId: "abc", comment_id: 4 })).toEqual({ gistId: "abc", commentId: 4 });
    expect(validateForkGistInput({ gistId: "abc" })).toEqual({ gistId: "abc" });
    expect(validateStarGistInput({ gistId: "abc" })).toEqual({ gistId: "abc" });
    expect(validateUnstarGistInput({ gist_id: "abc" })).toEqual({ gistId: "abc" });
    expect(() => validateCreateGistCommentInput({ gistId: "a/b", body: "hi" })).toThrow(/single path segment/);
    expect(() => validateStarGistInput({ gistId: "a?b" })).toThrow(/single path segment/);
    expect(() => validateCreateGistCommentInput({ gistId: "abc" })).toThrow(/body is required/);
    expect(() => validateUpdateGistCommentInput({ gistId: "abc", commentId: 0, body: "x" })).toThrow(/comment_id/);
    expect(createGistComment({ gistId: "abc", body: "hi" }).validated).toEqual({ gistId: "abc", body: "hi" });
    expect(starGist({ gistId: "abc" }).validated).toEqual({ gistId: "abc" });
    await expect(forkGist({
      accessToken: "t",
      gistId: "abc",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

const PATHS: Record<string, string> = {
  "gists.comments.create": "POST /gists/{gist_id}/comments",
  "gists.comments.update": "PATCH /gists/{gist_id}/comments/{comment_id}",
  "gists.comments.delete": "DELETE /gists/{gist_id}/comments/{comment_id}",
  "gists.fork": "POST /gists/{gist_id}/forks",
  "gists.star": "PUT /gists/{gist_id}/star",
  "gists.unstar": "DELETE /gists/{gist_id}/star",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
