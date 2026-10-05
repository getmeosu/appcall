import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  unfollowUser,
  createGistComment,
  deleteGistComment,
  updateGistComment,
  createGistFork,
  starGist,
  unstarGist,
} from "../src/actions";

const PATHS = {
  "user.following.unfollow": "DELETE /user/following/{username}",
  "gists.comments.create": "POST /gists/{gist_id}/comments",
  "gists.comments.delete": "DELETE /gists/{gist_id}/comments/{comment_id}",
  "gists.comments.update": "PATCH /gists/{gist_id}/comments/{comment_id}",
  "gists.forks.create": "POST /gists/{gist_id}/forks",
  "gists.star": "PUT /gists/{gist_id}/star",
  "gists.unstar": "DELETE /gists/{gist_id}/star",
} as const;

const OMIT = [
  "user.following.unfollow",
  "gists.comments.create",
  "gists.comments.delete",
  "gists.forks.create",
  "gists.star",
  "gists.unstar",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github write card 12 unfollow and gist writes", () => {
  test("version is 0.68.0 at 685 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.68.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(685);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 635, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 343, write: 277, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    for (const key of OMIT) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["gists.comments.update"].effectPolicy).toBe("Reconcile");
    expect(ops["gists.comments.update"].reconcile).toBe("gists.comments.get");
    expect(ops["gists.comments.update"].effect).toBeUndefined();
    expect(String(ops["gists.comments.get"].description)).toContain("GET /gists/{gist_id}/comments/{comment_id}");
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return json(status, body);
    };

    const unfollowed = await unfollowUser({
      accessToken: token, username: "octocat", fetch: fetchOf(204),
    });
    expect(unfollowed).toMatchObject({
      action: "user.following.unfollow", unfollowed: true, username: "octocat",
    });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/user/following/octocat");

    const comment = { id: 1, body: "hi" };
    const created = await createGistComment({
      accessToken: token, gistId: "abc", body: "hi", fetch: fetchOf(201, comment),
    });
    expect(created.comment).toEqual(comment);
    expect(calls.at(-1)).toContain("POST https://api.github.com/gists/abc/comments");
    expect(calls.at(-1)).toContain(JSON.stringify({ body: "hi" }));

    const deleted = await deleteGistComment({
      accessToken: token, gistId: "abc", commentId: 1, fetch: fetchOf(204),
    });
    expect(deleted).toMatchObject({
      action: "gists.comments.delete", deleted: true, gistId: "abc", commentId: 1,
    });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/gists/abc/comments/1");

    const updated = await updateGistComment({
      accessToken: token, gistId: "abc", commentId: 1, body: "bye", fetch: fetchOf(200, { id: 1, body: "bye" }),
    });
    expect(updated.comment).toEqual({ id: 1, body: "bye" });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/gists/abc/comments/1");

    const fork = { id: "forked", forks: [] };
    const forked = await createGistFork({
      accessToken: token, gistId: "abc", fetch: fetchOf(201, fork),
    });
    expect(forked.gist).toEqual(fork);
    expect(calls.at(-1)).toContain("POST https://api.github.com/gists/abc/forks");

    const starred = await starGist({
      accessToken: token, gistId: "abc", fetch: fetchOf(204),
    });
    expect(starred).toMatchObject({ action: "gists.star", starred: true, gistId: "abc" });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/gists/abc/star");

    const unstarred = await unstarGist({
      accessToken: token, gistId: "abc", fetch: fetchOf(204),
    });
    expect(unstarred).toMatchObject({ action: "gists.unstar", unstarred: true, gistId: "abc" });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/gists/abc/star");

    await expect(unfollowUser({
      accessToken: token, username: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteGistComment({
      accessToken: token, gistId: "abc", commentId: 9, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(starGist({
      accessToken: token, gistId: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => unfollowUser({ username: "" } as never)).toThrow();
    expect(() => createGistComment({ gistId: "abc" } as never)).toThrow();
    expect(() => deleteGistComment({ gistId: "abc", commentId: 0 } as never)).toThrow();
    expect(() => updateGistComment({ gistId: "abc", commentId: 1, body: "" } as never)).toThrow();
    expect(unfollowUser({ username: "octocat" })).toMatchObject({
      action: "user.following.unfollow", validated: { username: "octocat" },
    });
    expect(starGist({ gistId: "abc" })).toMatchObject({
      action: "gists.star", validated: { gistId: "abc" },
    });
  });
});
