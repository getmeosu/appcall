import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  createOrgHook,
  deleteRepoHook,
  deleteOrgHook,
  pingOrgHook,
  pingRepoHook,
  redeliverOrgHookDelivery,
  redeliverRepoHookDelivery,
  updateOrgHook,
  updateRepoHook,
  createIssueReaction,
  createIssueCommentReaction,
  createCommitCommentReaction,
  createPullReviewCommentReaction,
  createReleaseReaction,
  deleteReleaseReaction,
  deleteCommitCommentReaction,
  deleteIssueCommentReaction,
  deleteIssueReaction,
} from "../src/actions";

const PATHS = {
  "orgs.hooks.create": "POST /orgs/{org}/hooks",
  "repos.hooks.delete": "DELETE /repos/{owner}/{repo}/hooks/{hook_id}",
  "orgs.hooks.delete": "DELETE /orgs/{org}/hooks/{hook_id}",
  "orgs.hooks.ping": "POST /orgs/{org}/hooks/{hook_id}/pings",
  "repos.hooks.ping": "POST /repos/{owner}/{repo}/hooks/{hook_id}/pings",
  "orgs.hooks.deliveries.redeliver": "POST /orgs/{org}/hooks/{hook_id}/deliveries/{delivery_id}/attempts",
  "repos.hooks.deliveries.redeliver": "POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts",
  "orgs.hooks.update": "PATCH /orgs/{org}/hooks/{hook_id}",
  "repos.hooks.update": "PATCH /repos/{owner}/{repo}/hooks/{hook_id}",
  "issues.reactions.create": "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions",
  "issues.comments.reactions.create": "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
  "commits.comments.reactions.create": "POST /repos/{owner}/{repo}/comments/{comment_id}/reactions",
  "pull_requests.review_comments.reactions.create": "POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions",
  "releases.reactions.create": "POST /repos/{owner}/{repo}/releases/{release_id}/reactions",
  "releases.reactions.delete": "DELETE /repos/{owner}/{repo}/releases/{release_id}/reactions/{reaction_id}",
  "commits.comments.reactions.delete": "DELETE /repos/{owner}/{repo}/comments/{comment_id}/reactions/{reaction_id}",
  "issues.comments.reactions.delete": "DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions/{reaction_id}",
  "issues.reactions.delete": "DELETE /repos/{owner}/{repo}/issues/{issue_number}/reactions/{reaction_id}",
} as const;

const NO_POLICY = [
  "orgs.hooks.create",
  "repos.hooks.delete",
  "orgs.hooks.delete",
  "orgs.hooks.ping",
  "repos.hooks.ping",
  "orgs.hooks.deliveries.redeliver",
  "repos.hooks.deliveries.redeliver",
  "issues.reactions.create",
  "issues.comments.reactions.create",
  "commits.comments.reactions.create",
  "pull_requests.review_comments.reactions.create",
  "releases.reactions.create",
  "releases.reactions.delete",
  "commits.comments.reactions.delete",
  "issues.comments.reactions.delete",
  "issues.reactions.delete",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 10 hooks and reactions writes", () => {
  test("version is 0.63.0 at 649 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.63.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(649);
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
    expect(kinds).toEqual({ action: 599, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 329, write: 255, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    expect(ops["orgs.hooks.update"].effectPolicy).toBe("Reconcile");
    expect(ops["orgs.hooks.update"].reconcile).toBe("orgs.hooks.get");
    expect(ops["orgs.hooks.update"].effect).toBeUndefined();
    expect(ops["repos.hooks.update"].effectPolicy).toBe("Reconcile");
    expect(ops["repos.hooks.update"].reconcile).toBe("repos.hooks.get");
    expect(ops["repos.hooks.update"].effect).toBeUndefined();
    expect(String(ops["orgs.hooks.get"].description)).toContain("GET /orgs/{org}/hooks/{hook_id}");
    expect(String(ops["repos.hooks.get"].description)).toContain("GET /repos/{owner}/{repo}/hooks/{hook_id}");
    expect(String(ops["orgs.hooks.create"].description)).toContain("Effect-unknown");
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["classroom"]).toBeUndefined();
  });

  test("hooks writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const hook = { id: 7, name: "web", active: true, events: ["push"] };

    const created = await createOrgHook({
      accessToken: token, org: "acme", url: "https://example.com/hook", events: ["push"], contentType: "json", fetch: fetchOf(201, hook),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/orgs/acme/hooks ");
    expect(calls.at(-1)).toContain('"url":"https://example.com/hook"');
    expect(created.hook).toEqual(hook);

    const deletedRepo = await deleteRepoHook({
      accessToken: token, owner: "acme", repo: "app", hookId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/hooks/7 ");
    expect(deletedRepo).toMatchObject({ action: "repos.hooks.delete", deleted: true, hookId: 7 });
    await expect(deleteRepoHook({
      accessToken: token, owner: "acme", repo: "app", hookId: 7, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const deletedOrg = await deleteOrgHook({
      accessToken: token, org: "acme", hookId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/acme/hooks/7 ");
    expect(deletedOrg).toMatchObject({ action: "orgs.hooks.delete", deleted: true });

    const pingedOrg = await pingOrgHook({
      accessToken: token, org: "acme", hookId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/orgs/acme/hooks/7/pings ");
    expect(pingedOrg).toMatchObject({ action: "orgs.hooks.ping", pinged: true });

    const pingedRepo = await pingRepoHook({
      accessToken: token, owner: "acme", repo: "app", hookId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/repos/acme/app/hooks/7/pings ");
    expect(pingedRepo).toMatchObject({ action: "repos.hooks.ping", pinged: true });

    const reOrg = await redeliverOrgHookDelivery({
      accessToken: token, org: "acme", hookId: 7, deliveryId: 99, fetch: fetchOf(202),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/orgs/acme/hooks/7/deliveries/99/attempts ");
    expect(reOrg).toMatchObject({ action: "orgs.hooks.deliveries.redeliver", redelivered: true, deliveryId: 99 });

    const reRepo = await redeliverRepoHookDelivery({
      accessToken: token, owner: "acme", repo: "app", hookId: 7, deliveryId: 99, fetch: fetchOf(202),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/repos/acme/app/hooks/7/deliveries/99/attempts ");
    expect(reRepo).toMatchObject({ action: "repos.hooks.deliveries.redeliver", redelivered: true });

    const updatedOrg = await updateOrgHook({
      accessToken: token, org: "acme", hookId: 7, active: false, fetch: fetchOf(200, hook),
    });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/orgs/acme/hooks/7 ");
    expect(updatedOrg.hook).toEqual(hook);

    const updatedRepo = await updateRepoHook({
      accessToken: token, owner: "acme", repo: "app", hookId: 7, url: "https://example.com/new", fetch: fetchOf(200, hook),
    });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/repos/acme/app/hooks/7 ");
    expect(updatedRepo.hook).toEqual(hook);
    await expect(updateRepoHook({
      accessToken: token, owner: "acme", repo: "app", hookId: 7, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("reaction writes use the documented method and path and a 404 on delete is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const reaction = { id: 1, content: "heart" };

    const issue = await createIssueReaction({
      accessToken: token, owner: "acme", repo: "app", issueNumber: 3, content: "heart", fetch: fetchOf(201, reaction),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/repos/acme/app/issues/3/reactions ${JSON.stringify({ content: "heart" })}`,
    );
    expect(issue.reaction).toEqual(reaction);

    const issueComment = await createIssueCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 8, content: "+1", fetch: fetchOf(200, reaction),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/repos/acme/app/issues/comments/8/reactions ${JSON.stringify({ content: "+1" })}`,
    );
    expect(issueComment.reaction).toEqual(reaction);

    const commitComment = await createCommitCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 8, content: "rocket", fetch: fetchOf(201, reaction),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/comments/8/reactions ");
    expect(commitComment.reaction).toEqual(reaction);

    const reviewComment = await createPullReviewCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 8, content: "eyes", fetch: fetchOf(201, reaction),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/pulls/comments/8/reactions ");
    expect(reviewComment.reaction).toEqual(reaction);

    const release = await createReleaseReaction({
      accessToken: token, owner: "acme", repo: "app", releaseId: 5, content: "hooray", fetch: fetchOf(201, reaction),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/releases/5/reactions ");
    expect(release.reaction).toEqual(reaction);

    const delRelease = await deleteReleaseReaction({
      accessToken: token, owner: "acme", repo: "app", releaseId: 5, reactionId: 1, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/releases/5/reactions/1 ");
    expect(delRelease).toMatchObject({ action: "releases.reactions.delete", deleted: true });
    await expect(deleteReleaseReaction({
      accessToken: token, owner: "acme", repo: "app", releaseId: 5, reactionId: 1, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const delCommit = await deleteCommitCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 8, reactionId: 1, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/comments/8/reactions/1 ");
    expect(delCommit).toMatchObject({ action: "commits.comments.reactions.delete", deleted: true });

    const delIssueComment = await deleteIssueCommentReaction({
      accessToken: token, owner: "acme", repo: "app", commentId: 8, reactionId: 1, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/issues/comments/8/reactions/1 ");
    expect(delIssueComment).toMatchObject({ action: "issues.comments.reactions.delete", deleted: true });

    const delIssue = await deleteIssueReaction({
      accessToken: token, owner: "acme", repo: "app", issueNumber: 3, reactionId: 1, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/issues/3/reactions/1 ");
    expect(delIssue).toMatchObject({ action: "issues.reactions.delete", deleted: true });
    await expect(deleteIssueReaction({
      accessToken: token, owner: "acme", repo: "app", issueNumber: 3, reactionId: 1, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
