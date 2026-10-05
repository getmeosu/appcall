import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import roleUsers from "../fixtures/org_role_users.json";
import subscription from "../fixtures/thread_subscription.json";
import usage from "../fixtures/billing_usage.json";
import {
  listOrgRoleUsers,
  getRepoTarball,
  getRepoZipball,
  checkRepoAssignee,
  checkUserBlocked,
  getNotificationThreadSubscription,
  getUserBillingUsage,
} from "../src/actions";
import { validateGetRepoTarballInput, validateCheckUserBlockedInput } from "../src/card3_reads";

const READS = [
  "orgs.organization_roles.users.list",
  "repos.tarball.get",
  "repos.zipball.get",
  "repos.assignees.check",
  "user.blocks.check",
  "notifications.threads.subscription.get",
  "users.billing.usage.get",
] as const;

describe("github card-3 reads", () => {
  test("manifest stays v0.66.0 at 671 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.66.0");
    expect(Object.keys(manifest.operations).length).toBe(671);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    expect(manifest.operations["orgs.organization_roles.get"]).toBeDefined();
    expect(manifest.operations["repos.subscription.get"].sideEffect).toBe("read");
  });

  test("validates required ref and single-segment usernames", () => {
    expect(validateGetRepoTarballInput({ owner: "acme", repo: "app", ref: "refs/heads/main" }).ref).toBe("refs/heads/main");
    expect(() => validateGetRepoTarballInput({ owner: "acme", repo: "app" })).toThrow(/ref is required/);
    expect(() => validateCheckUserBlockedInput({ username: "octo/cat" })).toThrow(/single path segment/);
  });

  test("tarball and zipball return Location and do not follow the 302", async () => {
    const calls: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} redirect=${init?.redirect}`);
      return new Response(null, { status: 302, headers: { Location: "https://codeload.github.com/acme/app/legacy.tar.gz/main" } });
    };
    const tar = await getRepoTarball({ accessToken: "t", owner: "acme", repo: "app", ref: "refs/heads/my branch", fetch: fetchFn });
    expect(tar.downloadUrl).toBe("https://codeload.github.com/acme/app/legacy.tar.gz/main");
    expect(calls).toEqual(["GET https://api.github.com/repos/acme/app/tarball/heads/my%20branch redirect=manual"]);

    calls.length = 0;
    const zip = await getRepoZipball({
      accessToken: "t", owner: "acme", repo: "app", ref: "v1.0",
      fetch: async (input, init) => {
        calls.push(String(input));
        expect(init?.redirect).toBe("manual");
        return new Response("archive-bytes", { status: 302, headers: { Location: "https://codeload.github.com/acme/app/legacy.zip/v1.0" } });
      },
    });
    expect(zip.downloadUrl).toBe("https://codeload.github.com/acme/app/legacy.zip/v1.0");
    expect(calls).toEqual(["https://api.github.com/repos/acme/app/zipball/v1.0"]);
    await expect(getRepoTarball({
      accessToken: "t", owner: "acme", repo: "missing", ref: "main",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("assignee and block checks use 204 as yes and 404 as no", async () => {
    const assigned = await checkRepoAssignee({
      accessToken: "t", owner: "acme", repo: "app", assignee: "octo",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/assignees/octo");
        return new Response(null, { status: 204 });
      },
    });
    expect(assigned.assigned).toBe(true);
    const notAssigned = await checkRepoAssignee({
      accessToken: "t", owner: "acme", repo: "app", assignee: "ada",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    });
    expect(notAssigned.assigned).toBe(false);

    const blocked = await checkUserBlocked({
      accessToken: "t", username: "spammer",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/user/blocks/spammer");
        return new Response(null, { status: 204 });
      },
    });
    expect(blocked.blocked).toBe(true);
    const clear = await checkUserBlocked({
      accessToken: "t", username: "ada",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    });
    expect(clear.blocked).toBe(false);
  });

  test("thread subscription keeps 304 distinct from an empty 200, and the other 404s stay upstream", async () => {
    const calls: string[] = [];
    const fresh = await getNotificationThreadSubscription({
      accessToken: "t", thread_id: "42",
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(null, { status: 304 });
      },
    });
    expect(fresh.notModified).toBe(true);
    expect(fresh.subscription).toBeUndefined();
    expect(calls).toEqual(["https://api.github.com/notifications/threads/42/subscription"]);

    const body = await getNotificationThreadSubscription({
      accessToken: "t", thread_id: "42",
      fetch: async () => new Response(JSON.stringify(subscription), { status: 200 }),
    });
    expect(body.notModified).toBe(false);
    expect((body.subscription as Record<string, unknown>).subscribed).toBe(true);
    expect((body.subscription as Record<string, unknown>).threadUrl).toContain("/threads/1");

    const users = await listOrgRoleUsers({
      accessToken: "t", org: "acme", role_id: 7, perPage: 5,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/organization-roles/7/users?per_page=5");
        return new Response(JSON.stringify(roleUsers), { status: 200 });
      },
    });
    expect((users.users as Array<Record<string, unknown>>)[0].login).toBe("octo");
    await expect(listOrgRoleUsers({
      accessToken: "t", org: "missing", role_id: 7,
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const bill = await getUserBillingUsage({
      accessToken: "t", username: "octo",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/users/octo/settings/billing/usage");
        return new Response(JSON.stringify(usage), { status: 200 });
      },
    });
    expect((bill.usageItems as Array<Record<string, unknown>>)[0].product).toBe("actions");
    await expect(getUserBillingUsage({
      accessToken: "t", username: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getNotificationThreadSubscription({
      accessToken: "t", thread_id: "missing",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
