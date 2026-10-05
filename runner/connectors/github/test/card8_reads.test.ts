import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getApp,
  getAuthenticatedUserPackage,
  getOrgPackage,
  getOrgPackageVersion,
  getUserPackage,
} from "../src/actions";
import { validateGetOrgPackageInput } from "../src/card8_reads";

const READS = [
  "apps.get",
  "orgs.packages.get",
  "users.packages.get",
  "user.packages.get",
  "orgs.packages.versions.get",
] as const;

const pkg = {
  id: 4,
  name: "@scope/app",
  package_type: "npm",
  url: "https://api.github.com/orgs/acme/packages/npm/%40scope%2Fapp",
  html_url: "https://github.com/orgs/acme/packages/npm/package/%40scope%2Fapp",
  version_count: 2,
  visibility: "private",
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-02-01T00:00:00Z",
  owner: { login: "acme", id: 9, type: "Organization" },
  repository: { name: "app" },
};

describe("github card8 app and package reads", () => {
  test("version stays 0.55.0 and the five reads omit effect fields", () => {
    expect(manifest.version).toBe("0.55.0");
    expect(READS).toHaveLength(5);
    expect(Object.keys(manifest.operations)).toHaveLength(575);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["apps.installation_requests.list"]).toBeUndefined();
    expect(manifest.operations["apps.installation.repositories.list"]).toBeUndefined();
    expect(manifest.operations["app.installations.list"]).toBeUndefined();
  });

  test("package names keep slashes and the three package gets stay distinct", () => {
    expect(validateGetOrgPackageInput({ org: "acme", packageType: "npm", packageName: "@scope/app" })).toEqual({
      org: "acme", packageType: "npm", packageName: "@scope/app",
    });
    expect(() => validateGetOrgPackageInput({ org: "ac/me", packageType: "npm", packageName: "app" })).toThrow(/single path segment/);
    expect(() => validateGetOrgPackageInput({ org: "acme", packageType: "pypi", packageName: "app" })).toThrow(/packageType/);
  });

  test("reads the documented paths", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("/apps/ci-bot")) {
        return json({ id: 1, slug: "ci-bot", node_id: "A", name: "CI", description: "bot", external_url: "https://example.com", html_url: "https://github.com/apps/ci-bot", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-02-01T00:00:00Z", client_secret: "nope" });
      }
      if (url.includes("/orgs/acme/packages/npm/%40scope%2Fapp/versions/8")) {
        return json({ id: 8, name: "1.0.0", url: "https://api.github.com/versions/8", package_html_url: "https://github.com/orgs/acme/packages", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-02-01T00:00:00Z", metadata: { package_type: "npm", container: { tags: ["latest"] } } });
      }
      if (url.includes("/orgs/acme/packages/")) return json(pkg);
      if (url.includes("/users/octocat/packages/")) return json(pkg);
      if (url.includes("/user/packages/")) return json(pkg);
      return new Response("{}", { status: 500 });
    };
    const token = { accessToken: "t", fetch };
    const app = await getApp({ ...token, appSlug: "ci-bot" });
    expect(app.app.slug).toBe("ci-bot");
    expect(JSON.stringify(app.app)).not.toContain("nope");
    const org = await getOrgPackage({ ...token, org: "acme", packageType: "npm", packageName: "@scope/app" });
    expect(org.package.name).toBe("@scope/app");
    expect(org.package.owner).toEqual({ login: "acme", id: 9 });
    expect(org.package.repository).toBeUndefined();
    const user = await getUserPackage({ ...token, username: "octocat", packageType: "container", packageName: "app" });
    expect(user.package.package_type).toBe("npm");
    const mine = await getAuthenticatedUserPackage({ ...token, packageType: "maven", packageName: "lib" });
    expect(mine.package.id).toBe(4);
    const version = await getOrgPackageVersion({ ...token, org: "acme", packageType: "npm", packageName: "@scope/app", packageVersionId: 8 });
    expect(version.version.metadata).toEqual({ package_type: "npm" });
    expect(seen).toEqual([
      "https://api.github.com/apps/ci-bot",
      "https://api.github.com/orgs/acme/packages/npm/%40scope%2Fapp",
      "https://api.github.com/users/octocat/packages/container/app",
      "https://api.github.com/user/packages/maven/lib",
      "https://api.github.com/orgs/acme/packages/npm/%40scope%2Fapp/versions/8",
    ]);
  });

  test("404 and 401 are CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = async () => new Response("{}", { status: 404 });
    const denied = async () => new Response("{}", { status: 401 });
    await expect(getApp({ accessToken: "t", appSlug: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgPackage({ accessToken: "t", org: "acme", packageType: "npm", packageName: "app", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getUserPackage({ accessToken: "t", username: "octocat", packageType: "npm", packageName: "app", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getAuthenticatedUserPackage({ accessToken: "t", packageType: "npm", packageName: "app", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgPackageVersion({ accessToken: "t", org: "acme", packageType: "npm", packageName: "app", packageVersionId: 1, fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("redirects are not followed", async () => {
    let calls = 0;
    const fetch = async (_input: string | URL, init?: RequestInit) => {
      calls += 1;
      expect(init?.redirect).toBe("manual");
      return new Response("", { status: 302, headers: { Location: "https://example.com/app" } });
    };
    await expect(getApp({ accessToken: "t", appSlug: "ci-bot", fetch })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    expect(calls).toBe(1);
  });

  test("validation-only path does not fetch", () => {
    const validated = getOrgPackageVersion({ org: "acme", packageType: "npm", packageName: "app", packageVersionId: 3 });
    expect(validated.validated).toEqual({ org: "acme", packageType: "npm", packageName: "app", packageVersionId: 3 });
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
