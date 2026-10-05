import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  acceptRepositoryInvitation,
  createRepoAutolink,
  generateRepoFromTemplate,
  createDependencySnapshot,
  declineRepositoryInvitation,
  deleteRepo,
  deleteRepoInvitation,
  deleteRepoSubscription,
  markRepoNotificationsRead,
  deleteRepoInteractionLimits,
  transferRepo,
  updateRepoInvitation,
  updateCheckSuitePreferences,
  replaceRepoTopics,
  setRepoSubscription,
  setRepoInteractionLimits,
} from "../src/actions";

const NO_POLICY = [
  "user.repository_invitations.accept",
  "repos.autolinks.create",
  "repos.generate",
  "repos.dependency_graph.snapshots.create",
  "user.repository_invitations.decline",
  "repos.delete",
  "repos.invitations.delete",
  "repos.subscription.delete",
  "repos.notifications.mark_read",
  "repos.interaction_limits.delete",
  "repos.transfer",
  "repos.invitations.update",
  "repos.check_suites.preferences.update",
] as const;

const RECONCILE = {
  "repos.topics.replace": "repos.topics.get",
  "repos.subscription.set": "repos.subscription.get",
  "repos.interaction_limits.set": "repos.interaction_limits.get",
} as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 2 repo writes", () => {
  test("version is 0.72.0 at 731 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.72.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(731);
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
    expect(kinds).toEqual({ action: 681, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 372, write: 294, absent: 15 });
    expect(String(ops["repos.topics.get"].description)).toContain("GET /repos/{owner}/{repo}/topics");
    expect(String(ops["repos.subscription.get"].description)).toContain("GET /repos/{owner}/{repo}/subscription");
    expect(String(ops["repos.interaction_limits.get"].description)).toContain("GET /repos/{owner}/{repo}/interaction-limits");
    expect(ops["repos.topics.get"].sideEffect).toBe("read");
    expect(ops["repos.subscription.get"].sideEffect).toBe("read");
    expect(ops["repos.interaction_limits.get"].sideEffect).toBe("read");
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    for (const [key, observe] of Object.entries(RECONCILE)) {
      const op = ops[key];
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(observe);
    }
    expect(ops["repos.fork"]).toBeDefined();
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 delete is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };

    const accepted = await acceptRepositoryInvitation({ accessToken: token, invitationId: 7, fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("PATCH https://api.github.com/user/repository_invitations/7 ");
    expect(accepted.accepted).toBe(true);

    const autolink = await createRepoAutolink({
      accessToken: token, owner: "acme", repo: "app", keyPrefix: "TICKET-", urlTemplate: "https://example.com/<num>", isAlphanumeric: true,
      fetch: fetchOf(201, { id: 1, key_prefix: "TICKET-", url_template: "https://example.com/<num>", is_alphanumeric: true }),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/autolinks");
    expect(autolink.autolink).toMatchObject({ id: 1 });

    const generated = await generateRepoFromTemplate({
      accessToken: token, templateOwner: "acme", templateRepo: "template", name: "app", private: true,
      fetch: fetchOf(201, { id: 2, name: "app", full_name: "acme/app" }),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/template/generate");
    expect(calls.at(-1)).toContain(JSON.stringify({ name: "app", private: true }));
    expect(generated.repository).toMatchObject({ name: "app" });

    const snapshot = await createDependencySnapshot({
      accessToken: token,
      owner: "acme",
      repo: "app",
      version: 0,
      sha: "ce587453ced02b1526dfb4cb910479d431683101",
      ref: "refs/heads/main",
      job: { id: "run", correlator: "build" },
      detector: { name: "octo", version: "0.0.1", url: "https://example.com/detector" },
      scanned: "2022-06-14T20:25:00Z",
      fetch: fetchOf(201, { id: 3, result: "OK", message: "accepted", created_at: "2022-06-14T20:25:01Z" }),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/dependency-graph/snapshots");
    expect(snapshot.snapshot).toMatchObject({ result: "OK" });

    const declined = await declineRepositoryInvitation({ accessToken: token, invitationId: 7, fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/repository_invitations/7 ");
    expect(declined.declined).toBe(true);
    await expect(declineRepositoryInvitation({ accessToken: token, invitationId: 7, fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const deleted = await deleteRepo({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app ");
    expect(deleted.deleted).toBe(true);
    await expect(deleteRepo({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const invite = await deleteRepoInvitation({ accessToken: token, owner: "acme", repo: "app", invitationId: 8, fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/invitations/8 ");
    expect(invite.deleted).toBe(true);
    await expect(deleteRepoInvitation({ accessToken: token, owner: "acme", repo: "app", invitationId: 8, fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const unsubscribed = await deleteRepoSubscription({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/subscription ");
    expect(unsubscribed.deleted).toBe(true);
    await expect(deleteRepoSubscription({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const marked = await markRepoNotificationsRead({
      accessToken: token, owner: "acme", repo: "app", lastReadAt: "2026-01-01T00:00:00Z", fetch: fetchOf(205),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/repos/acme/app/notifications");
    expect(calls.at(-1)).toContain(JSON.stringify({ last_read_at: "2026-01-01T00:00:00Z" }));
    expect(marked.marked).toBe(true);
    expect(marked.status).toBe(205);
    const acceptedLater = await markRepoNotificationsRead({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(202, { message: "queued" }) });
    expect(acceptedLater.status).toBe(202);

    const limitsDeleted = await deleteRepoInteractionLimits({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(204) });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/interaction-limits ");
    expect(limitsDeleted.deleted).toBe(true);
    await expect(deleteRepoInteractionLimits({ accessToken: token, owner: "acme", repo: "app", fetch: fetchOf(404) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const transferred = await transferRepo({
      accessToken: token, owner: "acme", repo: "app", newOwner: "octo", newName: "moved",
      fetch: fetchOf(202, { id: 4, name: "moved", full_name: "octo/moved" }),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/transfer");
    expect(calls.at(-1)).toContain(JSON.stringify({ new_owner: "octo", new_name: "moved" }));
    expect(transferred.repository).toMatchObject({ name: "moved" });

    const updatedInvite = await updateRepoInvitation({
      accessToken: token, owner: "acme", repo: "app", invitationId: 8, permissions: "write",
      fetch: fetchOf(200, { id: 8, permissions: "write" }),
    });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/repos/acme/app/invitations/8");
    expect(updatedInvite.invitation).toMatchObject({ permissions: "write" });

    const preferences = await updateCheckSuitePreferences({
      accessToken: token, owner: "acme", repo: "app", autoTriggerChecks: [{ appId: 4, setting: false }],
      fetch: fetchOf(200, { preferences: { auto_trigger_checks: [{ app_id: 4, setting: false }] }, repository: { name: "app" } }),
    });
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/repos/acme/app/check-suites/preferences");
    expect(calls.at(-1)).toContain(JSON.stringify({ auto_trigger_checks: [{ app_id: 4, setting: false }] }));
    expect(preferences.preferences).toMatchObject({ preferences: { auto_trigger_checks: [{ app_id: 4, setting: false }] } });

    const topics = await replaceRepoTopics({
      accessToken: token, owner: "acme", repo: "app", names: ["api"],
      fetch: fetchOf(200, { names: ["api"] }),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/repos/acme/app/topics");
    expect(calls.at(-1)).toContain(JSON.stringify({ names: ["api"] }));
    expect(topics.topics).toMatchObject({ names: ["api"] });

    const subscription = await setRepoSubscription({
      accessToken: token, owner: "acme", repo: "app", subscribed: true, ignored: false,
      fetch: fetchOf(200, { subscribed: true, ignored: false, reason: null }),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/repos/acme/app/subscription");
    expect(calls.at(-1)).toContain(JSON.stringify({ subscribed: true, ignored: false }));
    expect(subscription.subscription).toMatchObject({ subscribed: true });

    const limits = await setRepoInteractionLimits({
      accessToken: token, owner: "acme", repo: "app", limit: "collaborators_only", expiry: "one_day",
      fetch: fetchOf(200, { limit: "collaborators_only", origin: "repository", expires_at: "2018-08-17T04:18:39Z" }),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/repos/acme/app/interaction-limits");
    expect(calls.at(-1)).toContain(JSON.stringify({ limit: "collaborators_only", expiry: "one_day" }));
    expect(limits.limits).toMatchObject({ limit: "collaborators_only" });
  });
});
