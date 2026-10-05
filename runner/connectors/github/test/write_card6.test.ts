import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteUserProjectItem,
  createCheckSuite,
  deleteThreadSubscription,
  markThreadDone,
  setThreadSubscription,
} from "../src/actions";

const NO_POLICY = [
  "users.projects_v2.items.delete",
  "checks.suites.create",
  "notifications.threads.subscription.delete",
  "notifications.threads.mark_done",
] as const;

const PATHS = {
  "users.projects_v2.items.delete": "DELETE /users/{username}/projectsV2/{project_number}/items/{item_id}",
  "checks.suites.create": "POST /repos/{owner}/{repo}/check-suites",
  "notifications.threads.subscription.delete": "DELETE /notifications/threads/{thread_id}/subscription",
  "notifications.threads.mark_done": "DELETE /notifications/threads/{thread_id}",
  "notifications.threads.subscription.set": "PUT /notifications/threads/{thread_id}/subscription",
} as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 6 notifications and project writes", () => {
  test("version is 0.59.0 at 619 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.59.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(619);
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
    expect(kinds).toEqual({ action: 569, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 328, write: 226, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      expect(String(ops[key].description)).toContain(path);
      expect(ops[key].kind).toBe("action");
      expect(ops[key].sideEffect).toBe("write");
    }
    const set = ops["notifications.threads.subscription.set"];
    expect(set.effectPolicy).toBe("Reconcile");
    expect(set.reconcile).toBe("notifications.threads.subscription.get");
    expect(set.effect).toBeUndefined();
    expect(String(ops["notifications.threads.subscription.get"].description)).toContain(
      "GET /notifications/threads/{thread_id}/subscription",
    );
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };

    const item = await deleteUserProjectItem({
      accessToken: token, username: "octo cat", projectNumber: 3, itemId: 9, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/users/octo%20cat/projectsV2/3/items/9 ");
    expect(item).toMatchObject({ deleted: true, username: "octo cat", projectNumber: 3, itemId: 9 });
    await expect(deleteUserProjectItem({
      accessToken: token, username: "octocat", projectNumber: 3, itemId: 9, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const suiteBody = { id: 5, head_sha: "d6fde92930d4715a2b49857d24b940956b26d2d3" };
    const suite = await createCheckSuite({
      accessToken: token, owner: "acme", repo: "app", headSha: "d6fde92930d4715a2b49857d24b940956b26d2d3",
      fetch: fetchOf(201, suiteBody),
    });
    expect(calls.at(-1)).toBe(
      `POST https://api.github.com/repos/acme/app/check-suites ${JSON.stringify({ head_sha: "d6fde92930d4715a2b49857d24b940956b26d2d3" })}`,
    );
    expect(suite.suite).toEqual(suiteBody);
    const existing = await createCheckSuite({
      accessToken: token, owner: "acme", repo: "app", headSha: "d6fde92930d4715a2b49857d24b940956b26d2d3",
      fetch: fetchOf(200, suiteBody),
    });
    expect(existing.suite).toEqual(suiteBody);
    await expect(createCheckSuite({
      accessToken: token, owner: "acme", repo: "app", headSha: "d6fde92930d4715a2b49857d24b940956b26d2d3", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const subDeleted = await deleteThreadSubscription({
      accessToken: token, threadId: "123", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/notifications/threads/123/subscription ");
    expect(subDeleted).toMatchObject({ deleted: true, threadId: "123" });
    await expect(deleteThreadSubscription({
      accessToken: token, threadId: "123", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const done = await markThreadDone({
      accessToken: token, threadId: "123", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/notifications/threads/123 ");
    expect(done).toMatchObject({ deleted: true, threadId: "123" });
    await expect(markThreadDone({
      accessToken: token, threadId: "123", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const subscriptionBody = { subscribed: true, ignored: false, reason: null };
    const set = await setThreadSubscription({
      accessToken: token, threadId: "123", ignored: false, fetch: fetchOf(200, subscriptionBody),
    });
    expect(calls.at(-1)).toBe(
      `PUT https://api.github.com/notifications/threads/123/subscription ${JSON.stringify({ ignored: false })}`,
    );
    expect(set.subscription).toEqual(subscriptionBody);
    await expect(setThreadSubscription({
      accessToken: token, threadId: "123", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
