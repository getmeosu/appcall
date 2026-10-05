import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deletePullReviewCommentReaction,
  deleteOrgActionsRunner,
  deleteRepoActionsRunner,
  followUser,
} from "../src/actions";

const PATHS = {
  "pull_requests.review_comments.reactions.delete":
    "DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}",
  "orgs.actions.runners.delete": "DELETE /orgs/{org}/actions/runners/{runner_id}",
  "repos.actions.runners.delete": "DELETE /repos/{owner}/{repo}/actions/runners/{runner_id}",
  "user.following.follow": "PUT /user/following/{username}",
} as const;

const NO_POLICY = [
  "pull_requests.review_comments.reactions.delete",
  "orgs.actions.runners.delete",
  "repos.actions.runners.delete",
  "user.following.follow",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 11 reaction runner follow writes", () => {
  test("version is 0.67.0 at 672 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.67.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(672);
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
    expect(kinds).toEqual({ action: 622, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 331, write: 276, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    // linus: user.following.follow omits BOTH effectPolicy and reconcile
    expect(ops["user.following.follow"].effectPolicy).toBeUndefined();
    expect(ops["user.following.follow"].reconcile).toBeUndefined();
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return empty(status);
    };

    const prRx = await deletePullReviewCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 9, reactionId: 3, fetch: fetchOf(204),
    });
    expect(prRx).toMatchObject({
      connector: "github", action: "pull_requests.review_comments.reactions.delete", source: "connector",
      deleted: true, owner: "acme", repo: "app", commentId: 9, reactionId: 3,
    });

    const orgRunner = await deleteOrgActionsRunner({
      accessToken: token, org: "acme", runnerId: 42, fetch: fetchOf(204),
    });
    expect(orgRunner).toMatchObject({
      connector: "github", action: "orgs.actions.runners.delete", source: "connector",
      deleted: true, org: "acme", runnerId: 42,
    });

    const repoRunner = await deleteRepoActionsRunner({
      accessToken: token, owner: "acme", repo: "app", runnerId: 7, fetch: fetchOf(204),
    });
    expect(repoRunner).toMatchObject({
      connector: "github", action: "repos.actions.runners.delete", source: "connector",
      deleted: true, owner: "acme", repo: "app", runnerId: 7,
    });

    const followed = await followUser({
      accessToken: token, username: "octocat", fetch: fetchOf(204),
    });
    expect(followed).toMatchObject({
      connector: "github", action: "user.following.follow", source: "connector",
      followed: true, username: "octocat",
    });

    expect(calls.some((c) => c.includes("DELETE") && c.includes("/pulls/comments/9/reactions/3"))).toBe(true);
    expect(calls.some((c) => c.includes("DELETE") && c.includes("/orgs/acme/actions/runners/42"))).toBe(true);
    expect(calls.some((c) => c.includes("DELETE") && c.includes("/repos/acme/app/actions/runners/7"))).toBe(true);
    expect(calls.some((c) => c.includes("PUT") && c.includes("/user/following/octocat"))).toBe(true);

    await expect(deletePullReviewCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 9, reactionId: 3, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteOrgActionsRunner({
      accessToken: token, org: "acme", runnerId: 42, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteRepoActionsRunner({
      accessToken: token, owner: "acme", repo: "app", runnerId: 7, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(followUser({
      accessToken: token, username: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("rate-limited 403 maps to CONNECTOR_RATE_LIMITED", async () => {
    const token = "not-a-token";
    const fetchOf = async () => new Response("", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60) },
    });
    await expect(followUser({ accessToken: token, username: "octocat", fetch: fetchOf })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
    await expect(deleteOrgActionsRunner({ accessToken: token, org: "acme", runnerId: 1, fetch: fetchOf })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => deletePullReviewCommentReaction({ owner: "acme", repo: "app", commentId: 0, reactionId: 1 } as never)).toThrow();
    expect(() => deleteOrgActionsRunner({ org: "acme/x", runnerId: 1 } as never)).toThrow();
    expect(() => deleteRepoActionsRunner({ owner: "acme", repo: "app", runnerId: -1 } as never)).toThrow();
    expect(() => followUser({ username: "" } as never)).toThrow();
    expect(deletePullReviewCommentReaction({
      owner: "acme", repo: "app", commentId: 9, reactionId: 3,
    })).toMatchObject({
      connector: "github", action: "pull_requests.review_comments.reactions.delete", source: "connector",
      validated: { owner: "acme", repo: "app", commentId: 9, reactionId: 3 },
    });
    expect(followUser({ username: "octocat" })).toMatchObject({
      connector: "github", action: "user.following.follow", source: "connector",
      validated: { username: "octocat" },
    });
  });
});
