import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import notificationsFixture from "../fixtures/notifications_list.json";
import threadSubscriptionFixture from "../fixtures/thread_subscription.json";
import repoSubscriptionFixture from "../fixtures/repo_subscription.json";
import {
  listLicenses,
  listGitignoreTemplates,
  getRateLimit,
  listRepoNotifications,
  checkStarred,
  getMetaRoot,
  markThreadDone,
  putThreadSubscription,
  deleteThreadSubscription,
  markRepoNotificationsRead,
  putRepoSubscription,
  deleteRepoSubscription,
} from "../src/actions";
import {
  validateListLicensesInput,
  validateListGitignoreTemplatesInput,
  validateGetRateLimitInput,
  validateListRepoNotificationsInput,
  validateCheckStarredInput,
  validateGetMetaRootInput,
  validateMarkThreadDoneInput,
  validatePutThreadSubscriptionInput,
  validateDeleteThreadSubscriptionInput,
  validateMarkRepoNotificationsReadInput,
  validatePutRepoSubscriptionInput,
  validateDeleteRepoSubscriptionInput,
} from "../src/card_activity_remaining";

const READS = [
  "licenses.list",
  "gitignore.templates.list",
  "rate_limit.get",
  "activity.repo_notifications.list",
  "activity.starred.check",
  "meta.root.get",
] as const;

const READ_PATHS: Record<(typeof READS)[number], string> = {
  "licenses.list": "GET /licenses",
  "gitignore.templates.list": "GET /gitignore/templates",
  "rate_limit.get": "GET /rate_limit",
  "activity.repo_notifications.list": "GET /repos/{owner}/{repo}/notifications",
  "activity.starred.check": "GET /user/starred/{owner}/{repo}",
  "meta.root.get": "GET /",
};

const RECONCILE = [
  ["activity.thread.mark_done", "notifications.get"],
  ["activity.thread.subscription.put", "notifications.threads.subscription.get"],
  ["activity.repo_notifications.mark_read", "activity.repo_notifications.list"],
  ["activity.repo.subscription.put", "repos.subscription.get"],
] as const;

const IDEMPOTENT = [
  "activity.thread.subscription.delete",
  "activity.repo.subscription.delete",
] as const;

const WRITE_PATHS: Record<string, string> = {
  "activity.thread.mark_done": "DELETE /notifications/threads/{thread_id}",
  "activity.thread.subscription.put": "PUT /notifications/threads/{thread_id}/subscription",
  "activity.thread.subscription.delete": "DELETE /notifications/threads/{thread_id}/subscription",
  "activity.repo_notifications.mark_read": "PUT /repos/{owner}/{repo}/notifications",
  "activity.repo.subscription.put": "PUT /repos/{owner}/{repo}/subscription",
  "activity.repo.subscription.delete": "DELETE /repos/{owner}/{repo}/subscription",
};

const licenseListBody = [
  {
    key: "mit",
    name: "MIT License",
    spdx_id: "MIT",
    url: "https://api.github.com/licenses/mit",
    node_id: "MDc6TGljZW5zZW1pdA==",
    html_url: "http://choosealicense.com/licenses/mit/",
    extra: "drop-me",
  },
];

const rateLimitBody = {
  resources: {
    core: { limit: 5000, used: 1, remaining: 4999, reset: 1372700873 },
    search: { limit: 30, used: 12, remaining: 18, reset: 1372697452 },
    graphql: { limit: 5000, used: 7, remaining: 4993, reset: 1372700389 },
  },
  rate: { limit: 5000, used: 1, remaining: 4999, reset: 1372700873 },
  extra: "drop-me",
};

const rootBody = {
  current_user_url: "https://api.github.com/user",
  rate_limit_url: "https://api.github.com/rate_limit",
  extra: "drop-me",
};

describe("github activity remaining licenses rate-limit card", () => {
  test("version is 0.44.0 at 436 ops with read/write policies and METHOD+path descriptions", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(READS).toHaveLength(6);
    expect(Object.keys(manifest.operations)).toHaveLength(436);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
      expect(String(op.description)).toContain(READ_PATHS[key]);
    }
    for (const [key, reconcile] of RECONCILE) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
      expect(String(op.description)).toContain(WRITE_PATHS[key]);
    }
    for (const key of IDEMPOTENT) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(WRITE_PATHS[key]);
    }
    expect(manifest.operations["licenses.get"]).toBeDefined();
    expect(manifest.operations["gitignore.templates.get"]).toBeDefined();
    expect(manifest.operations["notifications.list"]).toBeDefined();
    expect(manifest.operations["notifications.threads.subscription.get"]).toBeDefined();
    expect(manifest.operations["repos.subscription.get"]).toBeDefined();
    expect(manifest.operations["repos.star"]).toBeDefined();
    expect(manifest.operations["meta.zen.get"]).toBeDefined();
    expect(manifest.operations["meta.feeds.get"]).toBeUndefined();
    expect(manifest.operations["meta.emojis.get"]).toBeUndefined();
    expect(manifest.operations["meta.get"]).toBeUndefined();
    expect(manifest.operations["meta.versions.get"]).toBeUndefined();
    expect(manifest.operations["meta.octocat.get"]).toBeUndefined();
  });

  test("reads the documented paths with the bearer token", async () => {
    const seen: Array<{ url: string; method: string; auth: string; accept: string }> = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string>;
      seen.push({
        url,
        method: init?.method ?? "GET",
        auth: headers.Authorization,
        accept: headers.Accept,
      });
      expect(headers.Authorization).toBe("Bearer t");
      expect(headers.Accept).toBe("application/vnd.github+json");
      if (url === "https://api.github.com/licenses") return json(licenseListBody);
      if (url === "https://api.github.com/gitignore/templates") return json(["C", "Node", "Go"]);
      if (url === "https://api.github.com/rate_limit") return json(rateLimitBody);
      if (url === "https://api.github.com/repos/acme/app/notifications?per_page=10&all=true") {
        return json(notificationsFixture);
      }
      if (url === "https://api.github.com/user/starred/acme/app") return empty(204);
      if (url === "https://api.github.com/") return json(rootBody);
      return new Response("{}", { status: 500 });
    };

    const licenses = await listLicenses({ accessToken: "t", fetch });
    expect((licenses.licenses as Array<Record<string, unknown>>)[0]).toEqual({
      key: "mit",
      name: "MIT License",
      spdxId: "MIT",
      url: "https://api.github.com/licenses/mit",
      nodeId: "MDc6TGljZW5zZW1pdA==",
      htmlUrl: "http://choosealicense.com/licenses/mit/",
    });
    expect(JSON.stringify(licenses.licenses)).not.toContain("drop-me");

    const templates = await listGitignoreTemplates({ accessToken: "t", fetch });
    expect(templates.templates).toEqual(["C", "Node", "Go"]);

    const rate = await getRateLimit({ accessToken: "t", fetch });
    expect((rate.rateLimit as Record<string, unknown>).resources).toMatchObject({
      core: { limit: 5000, used: 1, remaining: 4999, reset: 1372700873 },
    });
    expect(JSON.stringify(rate.rateLimit)).not.toContain("drop-me");

    const listed = await listRepoNotifications({
      accessToken: "t",
      fetch,
      owner: "acme",
      repo: "app",
      perPage: 10,
      all: true,
    });
    expect((listed.notifications as Array<Record<string, unknown>>)[0].threadId).toBe("1");

    const starred = await checkStarred({ accessToken: "t", fetch, owner: "acme", repo: "app" });
    expect(starred.starred).toBe(true);

    const root = await getMetaRoot({ accessToken: "t", fetch });
    expect((root.root as Record<string, unknown>).currentUserUrl).toBe("https://api.github.com/user");
    expect((root.root as Record<string, unknown>).rateLimitUrl).toBe("https://api.github.com/rate_limit");
    expect(JSON.stringify(root.root)).not.toContain("drop-me");

    expect(seen.map((call) => call.url)).toEqual([
      "https://api.github.com/licenses",
      "https://api.github.com/gitignore/templates",
      "https://api.github.com/rate_limit",
      "https://api.github.com/repos/acme/app/notifications?per_page=10&all=true",
      "https://api.github.com/user/starred/acme/app",
      "https://api.github.com/",
    ]);
    expect(seen.every((call) => call.method === "GET")).toBe(true);
  });

  test("starred.check maps 404 to starred false and a normal 404 elsewhere is CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = async () => new Response("", { status: 404 });
    const denied = async () => new Response("", { status: 401 });
    const notStarred = await checkStarred({ accessToken: "t", owner: "acme", repo: "app", fetch: missing });
    expect(notStarred.starred).toBe(false);
    await expect(checkStarred({ accessToken: "t", owner: "acme", repo: "app", fetch: denied })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(listLicenses({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listGitignoreTemplates({ accessToken: "t", fetch: missing })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(getRateLimit({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoNotifications({ accessToken: "t", owner: "acme", repo: "app", fetch: missing })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(getMetaRoot({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("writes hit the documented methods and paths", async () => {
    const requests: Request[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      if (body === undefined) return empty(status);
      return json(body, status);
    };

    const done = await markThreadDone({
      accessToken: "t",
      threadId: "42",
      fetch: fetchOf(204),
    });
    expect(requests.at(-1)?.method).toBe("DELETE");
    expect(requests.at(-1)?.url).toBe("https://api.github.com/notifications/threads/42");
    expect(done.done).toBe(true);
    expect(done.threadId).toBe("42");

    const putThread = await putThreadSubscription({
      accessToken: "t",
      thread_id: "42",
      ignored: true,
      fetch: fetchOf(200, { ...threadSubscriptionFixture, ignored: true }),
    });
    expect(requests.at(-1)?.method).toBe("PUT");
    expect(requests.at(-1)?.url).toBe("https://api.github.com/notifications/threads/42/subscription");
    expect(JSON.parse(await requests.at(-1)!.clone().text())).toEqual({ ignored: true });
    expect((putThread.subscription as Record<string, unknown>).ignored).toBe(true);

    const deletedThread = await deleteThreadSubscription({
      accessToken: "t",
      threadId: "42",
      fetch: fetchOf(204),
    });
    expect(requests.at(-1)?.method).toBe("DELETE");
    expect(requests.at(-1)?.url).toBe("https://api.github.com/notifications/threads/42/subscription");
    expect(deletedThread.deleted).toBe(true);

    const marked = await markRepoNotificationsRead({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      lastReadAt: "2022-06-10T00:00:00Z",
      fetch: fetchOf(202, { message: "Accepted" }),
    });
    expect(requests.at(-1)?.method).toBe("PUT");
    expect(requests.at(-1)?.url).toBe("https://api.github.com/repos/acme/app/notifications");
    expect(JSON.parse(await requests.at(-1)!.clone().text())).toEqual({ last_read_at: "2022-06-10T00:00:00Z" });
    expect(marked.marked).toBe(true);

    const putRepo = await putRepoSubscription({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      subscribed: true,
      ignored: false,
      fetch: fetchOf(200, repoSubscriptionFixture),
    });
    expect(requests.at(-1)?.method).toBe("PUT");
    expect(requests.at(-1)?.url).toBe("https://api.github.com/repos/acme/app/subscription");
    expect(JSON.parse(await requests.at(-1)!.clone().text())).toEqual({ subscribed: true, ignored: false });
    expect((putRepo.subscription as Record<string, unknown>).subscribed).toBe(true);

    const deletedRepo = await deleteRepoSubscription({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: fetchOf(204),
    });
    expect(requests.at(-1)?.method).toBe("DELETE");
    expect(requests.at(-1)?.url).toBe("https://api.github.com/repos/acme/app/subscription");
    expect(deletedRepo.deleted).toBe(true);

    await expect(markThreadDone({ accessToken: "t", threadId: "missing", fetch: async () => empty(404) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      deleteThreadSubscription({ accessToken: "t", threadId: "missing", fetch: async () => empty(404) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch and path segments stay single", () => {
    expect(validateListLicensesInput({})).toEqual({});
    expect(validateListLicensesInput(undefined)).toEqual({});
    expect(validateListGitignoreTemplatesInput({})).toEqual({});
    expect(validateGetRateLimitInput({})).toEqual({});
    expect(validateGetMetaRootInput({})).toEqual({});
    expect(validateListRepoNotificationsInput({ owner: "acme", repo: "app", perPage: 50, page: 2 })).toEqual({
      owner: "acme",
      repo: "app",
      perPage: 50,
      page: 2,
    });
    expect(() => validateListRepoNotificationsInput({ owner: "acme", repo: "app", perPage: 0 })).toThrow(/perPage/);
    expect(() => validateListRepoNotificationsInput({ owner: "acme", repo: "app", perPage: 101 })).toThrow(/perPage/);
    expect(() => validateListRepoNotificationsInput({ owner: "a/b", repo: "app" })).toThrow(/single path segment/);
    expect(() => validateListRepoNotificationsInput({ owner: "acme", repo: "a?b" })).toThrow(/single path segment/);
    expect(() => validateCheckStarredInput({ owner: "acme", repo: "a#b" })).toThrow(/single path segment/);
    expect(validateCheckStarredInput({ owner: "acme", repo: "app" })).toEqual({ owner: "acme", repo: "app" });
    expect(validateMarkThreadDoneInput({ threadId: "42" })).toEqual({ threadId: "42" });
    expect(validateMarkThreadDoneInput({ thread_id: "42" })).toEqual({ threadId: "42" });
    expect(() => validateMarkThreadDoneInput({})).toThrow(/thread_id is required/);
    expect(() => validateMarkThreadDoneInput({ threadId: "a/b" })).toThrow(/single path segment/);
    expect(() => validatePutThreadSubscriptionInput({ threadId: "42", ignored: "yes" })).toThrow(/ignored must be a boolean/);
    expect(validatePutThreadSubscriptionInput({ threadId: "42", ignored: true })).toEqual({ threadId: "42", ignored: true });
    expect(validateDeleteThreadSubscriptionInput({ threadId: "42" })).toEqual({ threadId: "42" });
    expect(validateMarkRepoNotificationsReadInput({ owner: "acme", repo: "app", lastReadAt: "2022-06-10T00:00:00Z" })).toEqual({
      owner: "acme",
      repo: "app",
      lastReadAt: "2022-06-10T00:00:00Z",
    });
    expect(validatePutRepoSubscriptionInput({ owner: "acme", repo: "app", subscribed: true })).toEqual({
      owner: "acme",
      repo: "app",
      subscribed: true,
    });
    expect(validateDeleteRepoSubscriptionInput({ owner: "acme", repo: "app" })).toEqual({ owner: "acme", repo: "app" });
    const validated = listLicenses({});
    expect(validated.validated).toEqual({});
    expect(validated.action).toBe("licenses.list");
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}
