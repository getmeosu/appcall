import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  checkAuthenticatedUserFollowing,
  getAuthenticatedUserInteractionLimits,
  getUserBillingUsageSummary,
  getUserById,
  getUserPremiumRequestUsage,
  listAuthenticatedUserPackages,
  listAuthenticatedUserPublicEmails,
  listAuthenticatedUserRepoInvitations,
  listCodesOfConduct,
  listGitignoreTemplates,
  listLicenses,
  listUserAttestations,
  setAuthenticatedUserInteractionLimits,
} from "../src/actions";
import {
  validateGetPremiumRequestUsageInput,
  validateGetUserByIdInput,
  validateListAuthenticatedPackagesInput,
  validateListLicensesInput,
  validateListUserAttestationsInput,
  validateSetAuthenticatedInteractionLimitsInput,
} from "../src/gap_g1";

const PATHS: Record<string, string> = {
  "users.get_by_id": "GET /user/{account_id}",
  "user.following.check": "GET /user/following/{username}",
  "user.public_emails.list": "GET /user/public_emails",
  "user.repository_invitations.list": "GET /user/repository_invitations",
  "user.packages.list": "GET /user/packages",
  "user.interaction_limits.get": "GET /user/interaction-limits",
  "user.interaction_limits.set": "PUT /user/interaction-limits",
  "users.attestations.list": "GET /users/{username}/attestations/{subject_digest}",
  "users.billing.premium_request_usage.get": "GET /users/{username}/settings/billing/premium_request/usage",
  "users.billing.usage.summary.get": "GET /users/{username}/settings/billing/usage/summary",
  "codes_of_conduct.list": "GET /codes_of_conduct",
  "licenses.list": "GET /licenses",
  "gitignore.templates.list": "GET /gitignore/templates",
};

const WRITES = ["user.interaction_limits.set"];

type Seen = { url: string; method: string; body?: string; auth?: string };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined, auth: headers.Authorization });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github gap G1 users, account, and meta reads", () => {
  test("version is 0.68.0 at 685 ops with the read/write breakdown", () => {
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
  });

  test("the thirteen G1 ops are present, omit all three effect keys, and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(13);
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(WRITES.includes(key) ? "write" : "read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      expect(String(op.description)).toContain(path.split(" ")[1]);
    }
    const schema = (key: string) => (ops[key].inputSchema as { properties: Record<string, { type: string }>; required?: string[] });
    expect(schema("users.get_by_id").properties.accountId.type).toBe("integer");
    expect(schema("user.packages.list").required).toEqual(["packageType"]);
    expect(schema("user.packages.list").properties.visibility.type).toBe("string");
    expect(schema("user.public_emails.list").properties.perPage.type).toBe("number");
    expect(schema("user.public_emails.list").properties.page.type).toBe("number");
    expect(schema("licenses.list").properties.featured.type).toBe("boolean");
    for (const key of ["users.billing.premium_request_usage.get", "users.billing.usage.summary.get"]) {
      expect(schema(key).properties.year.type).toBe("integer");
      expect(schema(key).properties.month.type).toBe("integer");
      expect(schema(key).properties.day.type).toBe("integer");
    }
    expect(schema("user.interaction_limits.set").required).toEqual(["limit"]);
    expect(schema("users.attestations.list").required).toEqual(["username", "subjectDigest"]);
  });

  test("validators enforce integer ids, required packageType, booleans, and integer dates", () => {
    expect(validateGetUserByIdInput({ accountId: 583231 })).toEqual({ accountId: 583231 });
    expect(() => validateGetUserByIdInput({ accountId: "583231" })).toThrow(/accountId/);
    expect(() => validateGetUserByIdInput({ accountId: 1.5 })).toThrow(/accountId/);
    expect(() => validateListAuthenticatedPackagesInput({})).toThrow(/packageType/);
    expect(() => validateListAuthenticatedPackagesInput({ packageType: "npm", visibility: "secret" })).toThrow(/visibility/);
    expect(validateListAuthenticatedPackagesInput({ packageType: "container", visibility: "private", perPage: 5 }))
      .toEqual({ packageType: "container", visibility: "private", perPage: 5 });
    expect(() => validateListLicensesInput({ featured: "true" })).toThrow(/featured/);
    expect(validateListLicensesInput({ featured: false })).toEqual({ featured: false });
    expect(() => validateGetPremiumRequestUsageInput({ username: "octo", month: 13 })).toThrow(/month/);
    expect(() => validateGetPremiumRequestUsageInput({ username: "octo", day: "1" })).toThrow(/day/);
    expect(validateGetPremiumRequestUsageInput({ username: "octo", year: 2026, month: 10, day: 5 }))
      .toEqual({ username: "octo", year: 2026, month: 10, day: 5 });
    expect(() => validateSetAuthenticatedInteractionLimitsInput({})).toThrow(/limit/);
    expect(() => validateSetAuthenticatedInteractionLimitsInput({ limit: "existing_users", expiry: "forever" })).toThrow(/expiry/);
    expect(() => validateListUserAttestationsInput({ username: "octo", subjectDigest: "a/b" })).toThrow(/single path segment/);
    expect(getUserById({ accountId: 1 })).toMatchObject({ action: "users.get_by_id", validated: { accountId: 1 } });
  });

  test("users.get_by_id reads GET /user/{account_id}", async () => {
    const { seen, fetch } = recorder([json({ id: 583231, login: "octocat", name: "The Octocat", type: "User" })]);
    const result = await getUserById({ accessToken: "t", accountId: 583231, fetch });
    expect(seen[0]).toMatchObject({ url: "https://api.github.com/user/583231", method: "GET", auth: "Bearer t" });
    expect((result.user as Record<string, unknown>).login).toBe("octocat");
    await expect(getUserById({ accessToken: "t", accountId: 9, fetch: recorder([json({}, 404)]).fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub user was not found." });
  });

  test("user.following.check treats 204 and 404 as successful reads", async () => {
    const yes = recorder([empty(204)]);
    expect(await checkAuthenticatedUserFollowing({ accessToken: "t", username: "hubot", fetch: yes.fetch })).toMatchObject({ following: true });
    expect(yes.seen[0].url).toBe("https://api.github.com/user/following/hubot");
    const no = recorder([empty(404)]);
    expect(await checkAuthenticatedUserFollowing({ accessToken: "t", username: "hubot", fetch: no.fetch })).toMatchObject({ following: false });
    await expect(checkAuthenticatedUserFollowing({ accessToken: "t", username: "hubot", fetch: recorder([json({}, 500)]).fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("user.public_emails.list and user.repository_invitations.list paginate", async () => {
    const emails = recorder([json([{ email: "octo@example.com", primary: true, verified: true, visibility: "public" }])]);
    const emailResult = await listAuthenticatedUserPublicEmails({ accessToken: "t", perPage: 10, page: 2, fetch: emails.fetch });
    expect(emails.seen[0].url).toBe("https://api.github.com/user/public_emails?per_page=10&page=2");
    expect((emailResult.emails as Record<string, unknown>[])[0]).toMatchObject({ email: "octo@example.com", primary: true });

    const invites = recorder([json([{ id: 1, permissions: "write", inviter: { login: "octocat" }, html_url: "https://github.com/o/r/invitations" }])]);
    const inviteResult = await listAuthenticatedUserRepoInvitations({ accessToken: "t", perPage: 5, fetch: invites.fetch });
    expect(invites.seen[0].url).toBe("https://api.github.com/user/repository_invitations?per_page=5");
    expect((inviteResult.invitations as Record<string, unknown>[])[0]).toMatchObject({ invitationId: 1, permissions: "write", inviter: "octocat" });
  });

  test("user.packages.list sends required package_type and optional visibility", async () => {
    const { seen, fetch } = recorder([json([{ id: 7, name: "pkg", package_type: "npm", visibility: "private" }])]);
    const result = await listAuthenticatedUserPackages({ accessToken: "t", packageType: "npm", visibility: "private", perPage: 3, page: 1, fetch });
    expect(seen[0].url).toBe("https://api.github.com/user/packages?package_type=npm&visibility=private&per_page=3&page=1");
    expect(result.packages).toEqual([{ id: 7, name: "pkg", packageType: "npm", visibility: "private" }]);
  });

  test("user.interaction_limits.get reads present and absent limits", async () => {
    const set = recorder([json({ limit: "collaborators_only", origin: "user", expires_at: "2026-10-06T00:00:00Z" })]);
    const present = await getAuthenticatedUserInteractionLimits({ accessToken: "t", fetch: set.fetch });
    expect(set.seen[0]).toMatchObject({ url: "https://api.github.com/user/interaction-limits", method: "GET" });
    expect(present).toMatchObject({ present: true, limits: { limit: "collaborators_only", origin: "user", expiresAt: "2026-10-06T00:00:00Z" } });
    expect(await getAuthenticatedUserInteractionLimits({ accessToken: "t", fetch: recorder([empty(204)]).fetch })).toMatchObject({ present: false });
    expect(await getAuthenticatedUserInteractionLimits({ accessToken: "t", fetch: recorder([json({})]).fetch })).toMatchObject({ present: false });
  });

  test("user.interaction_limits.set PUTs limit and expiry with no effect policy", async () => {
    const { seen, fetch } = recorder([json({ limit: "existing_users", origin: "user", expires_at: "2026-10-06T00:00:00Z" })]);
    const result = await setAuthenticatedUserInteractionLimits({ accessToken: "t", limit: "existing_users", expiry: "one_day", fetch });
    expect(seen[0]).toMatchObject({ url: "https://api.github.com/user/interaction-limits", method: "PUT" });
    expect(JSON.parse(String(seen[0].body))).toEqual({ limit: "existing_users", expiry: "one_day" });
    expect(result).toMatchObject({ action: "user.interaction_limits.set", limits: { limit: "existing_users" } });
    expect(Object.keys(result)).not.toContain("effect");
    await expect(setAuthenticatedUserInteractionLimits({ accessToken: "t", limit: "existing_users", fetch: recorder([json({}, 422)]).fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("users.attestations.list encodes the digest and cursor params", async () => {
    const { seen, fetch } = recorder([json({ attestations: [{ repository_id: 42, bundle_url: "https://example.com/b", bundle: { mediaType: "x" } }] })]);
    const result = await listUserAttestations({ accessToken: "t", username: "octo", subjectDigest: "sha256:abc", perPage: 2, before: "b1", after: "a1", fetch });
    expect(seen[0].url).toBe("https://api.github.com/users/octo/attestations/sha256%3Aabc?per_page=2&before=b1&after=a1");
    expect(result.attestations).toEqual([{ repositoryId: 42, bundleUrl: "https://example.com/b", bundle: { mediaType: "x" } }]);
  });

  test("billing premium request usage and usage summary send integer date queries", async () => {
    const premium = recorder([json({
      timePeriod: { year: 2026, month: 10, day: 5 },
      user: "octo",
      usageItems: [{ product: "Copilot", sku: "premium", model: "m1", unitType: "requests", pricePerUnit: 0.04, grossQuantity: 10, grossAmount: 0.4, discountQuantity: 0, discountAmount: 0, netQuantity: 10, netAmount: 0.4 }],
    })]);
    const p = await getUserPremiumRequestUsage({ accessToken: "t", username: "octo", year: 2026, month: 10, day: 5, fetch: premium.fetch });
    expect(premium.seen[0].url).toBe("https://api.github.com/users/octo/settings/billing/premium_request/usage?year=2026&month=10&day=5");
    expect(p.timePeriod).toEqual({ year: 2026, month: 10, day: 5 });
    expect((p.usageItems as Record<string, unknown>[])[0]).toMatchObject({ model: "m1", netQuantity: 10 });

    const summary = recorder([json({ timePeriod: { year: 2026 }, user: "octo", usageItems: [{ product: "Actions", sku: "linux", unitType: "minutes", netAmount: 1.5 }] })]);
    const s = await getUserBillingUsageSummary({ accessToken: "t", username: "octo", year: 2026, fetch: summary.fetch });
    expect(summary.seen[0].url).toBe("https://api.github.com/users/octo/settings/billing/usage/summary?year=2026");
    expect((s.usageItems as Record<string, unknown>[])[0]).toMatchObject({ product: "Actions", netAmount: 1.5 });
    await expect(getUserBillingUsageSummary({ accessToken: "t", username: "octo", fetch: recorder([json({}, 404)]).fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub billing usage summary was not found." });
  });

  test("meta lists: codes of conduct, licenses, and gitignore templates", async () => {
    const coc = recorder([json([{ key: "contributor_covenant", name: "Contributor Covenant", url: "https://api.github.com/codes_of_conduct/contributor_covenant", html_url: "https://www.contributor-covenant.org" }])]);
    const c = await listCodesOfConduct({ accessToken: "t", fetch: coc.fetch });
    expect(coc.seen[0].url).toBe("https://api.github.com/codes_of_conduct");
    expect((c.codesOfConduct as Record<string, unknown>[])[0]).toMatchObject({ key: "contributor_covenant", htmlUrl: "https://www.contributor-covenant.org" });

    const lic = recorder([json([{ key: "mit", name: "MIT License", spdx_id: "MIT", url: "https://api.github.com/licenses/mit", node_id: "MDc6TGljZW5zZW1pdA==" }])]);
    const l = await listLicenses({ accessToken: "t", featured: true, perPage: 50, fetch: lic.fetch });
    expect(lic.seen[0].url).toBe("https://api.github.com/licenses?featured=true&per_page=50");
    expect((l.licenses as Record<string, unknown>[])[0]).toMatchObject({ key: "mit", spdxId: "MIT" });

    const gi = recorder([json(["Actionscript", "Android", "Go"])]);
    const g = await listGitignoreTemplates({ accessToken: "t", fetch: gi.fetch });
    expect(gi.seen[0].url).toBe("https://api.github.com/gitignore/templates");
    expect(g.templates).toEqual(["Actionscript", "Android", "Go"]);
  });

  test("rate limits map to CONNECTOR_RATE_LIMITED", async () => {
    const fetch = recorder(() => new Response("{}", { status: 429, headers: { "retry-after": "30" } })).fetch;
    await expect(listLicenses({ accessToken: "t", fetch })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});
