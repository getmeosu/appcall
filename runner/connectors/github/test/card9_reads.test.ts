import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getUserPackageVersion,
  getAuthenticatedPackageVersion,
  listOrgPackages,
  listUserPackages,
  listUserPackageVersions,
  getRepoCodespaceDefaults,
  getCodespaceExport,
  listRepoCodespaceMachines,
  listOrgMemberCodespaces,
  listUserCodespaces,
  listOrgCodespaces,
  listCodespaceMachines,
} from "../src/actions";
import { validateListOrgPackagesInput, validateGetAuthenticatedPackageVersionInput } from "../src/card9_reads";

const READS = [
  "users.packages.versions.get",
  "user.packages.versions.get",
  "orgs.packages.list",
  "users.packages.list",
  "users.packages.versions.list",
  "repos.codespaces.new.get",
  "user.codespaces.exports.get",
  "repos.codespaces.machines.list",
  "orgs.members.codespaces.list",
  "user.codespaces.list",
  "orgs.codespaces.list",
  "user.codespaces.machines.list",
] as const;

const PATHS: Record<(typeof READS)[number], string> = {
  "users.packages.versions.get": "GET /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}",
  "user.packages.versions.get": "GET /user/packages/{package_type}/{package_name}/versions/{package_version_id}",
  "orgs.packages.list": "GET /orgs/{org}/packages",
  "users.packages.list": "GET /users/{username}/packages",
  "users.packages.versions.list": "GET /users/{username}/packages/{package_type}/{package_name}/versions",
  "repos.codespaces.new.get": "GET /repos/{owner}/{repo}/codespaces/new",
  "user.codespaces.exports.get": "GET /user/codespaces/{codespace_name}/exports/{export_id}",
  "repos.codespaces.machines.list": "GET /repos/{owner}/{repo}/codespaces/machines",
  "orgs.members.codespaces.list": "GET /orgs/{org}/members/{username}/codespaces",
  "user.codespaces.list": "GET /user/codespaces",
  "orgs.codespaces.list": "GET /orgs/{org}/codespaces",
  "user.codespaces.machines.list": "GET /user/codespaces/{codespace_name}/machines",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("github card-9 reads", () => {
  test("version stays 0.45.0 at 479 ops and the new reads omit effect policy", () => {
    expect(manifest.version).toBe("0.45.0");
    expect(Object.keys(manifest.operations).length).toBe(479);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    const check = manifest.operations["repos.assignees.check"] as Record<string, unknown>;
    expect(check.sideEffect).toBe("read");
    expect(String(check.description)).toContain("GET /repos/{owner}/{repo}/assignees/{assignee}");
    expect(manifest.operations["codes_of_conduct.get"].sideEffect).toBe("read");
    expect(manifest.operations["user.codespaces.secrets.list"]).toBeDefined();
  });

  test("package_type is required on the collection lists and version ids are integers", () => {
    expect(validateListOrgPackagesInput({ org: "acme", packageType: "container", perPage: 5 }).packageType).toBe("container");
    expect(() => validateListOrgPackagesInput({ org: "acme" })).toThrow(/package_type is required/);
    expect(() => validateGetAuthenticatedPackageVersionInput({ packageType: "npm", packageName: "app", packageVersionId: 0 })).toThrow(/positive integer/);
    expect(() => validateListOrgPackagesInput({ org: "acme", packageType: "deb" })).toThrow(/package type/);
  });

  test("200 returns the body and 404 stays upstream on the exact paths", async () => {
    const calls: string[] = [];
    const fetchOf = (body: unknown) => async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json(body);
    };
    const missing = async () => json({ message: "Not Found" }, 404);

    const version = await getUserPackageVersion({
      accessToken: "t", username: "octo", packageType: "container", packageName: "acme/app", packageVersionId: 9,
      fetch: fetchOf({ id: 9, name: "1.0.0", created_at: "2026-01-01T00:00:00Z" }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octo/packages/container/acme%2Fapp/versions/9");
    expect((version.packageVersion as Record<string, unknown>).name).toBe("1.0.0");
    await expect(getUserPackageVersion({
      accessToken: "t", username: "octo", packageType: "npm", packageName: "app", packageVersionId: 9, fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const mine = await getAuthenticatedPackageVersion({
      accessToken: "t", packageType: "npm", packageName: "app", packageVersionId: 3,
      fetch: fetchOf({ id: 3, name: "0.1.0", created_at: "2026-01-02T00:00:00Z" }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/user/packages/npm/app/versions/3");
    expect((mine.packageVersion as Record<string, unknown>).id).toBe(3);
    await expect(getAuthenticatedPackageVersion({
      accessToken: "t", packageType: "npm", packageName: "missing", packageVersionId: 3, fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const orgPackages = await listOrgPackages({
      accessToken: "t", org: "acme", packageType: "npm", perPage: 5,
      fetch: fetchOf([{ id: 1, name: "lib", package_type: "npm", visibility: "private" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/orgs/acme/packages?package_type=npm&per_page=5");
    expect((orgPackages.packages as Array<Record<string, unknown>>)[0].name).toBe("lib");
    await expect(listOrgPackages({ accessToken: "t", org: "missing", packageType: "npm", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const userPackages = await listUserPackages({
      accessToken: "t", username: "octo", packageType: "maven",
      fetch: fetchOf([{ id: 2, name: "jar", package_type: "maven", visibility: "public" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octo/packages?package_type=maven");
    expect((userPackages.packages as Array<Record<string, unknown>>)[0].packageType).toBe("maven");

    const versions = await listUserPackageVersions({
      accessToken: "t", username: "octo", packageType: "npm", packageName: "app", page: 2,
      fetch: fetchOf([{ id: 4, name: "2.0.0", created_at: "2026-02-01T00:00:00Z" }]),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octo/packages/npm/app/versions?page=2");
    expect((versions.versions as Array<Record<string, unknown>>)[0].id).toBe(4);

    const defaults = await getRepoCodespaceDefaults({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: fetchOf({ billable_owner: { login: "acme" }, defaults: { location: "EuropeWest", devcontainer_path: ".devcontainer/devcontainer.json" } }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/codespaces/new");
    expect(defaults.defaults).toMatchObject({ location: "EuropeWest", billableOwner: "acme" });

    const exported = await getCodespaceExport({
      accessToken: "t", codespaceName: "octo-app", exportId: "exp-1",
      fetch: fetchOf({ id: "exp-1", state: "succeeded", completed_at: "2026-03-01T00:00:00Z" }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/user/codespaces/octo-app/exports/exp-1");
    expect((exported.export as Record<string, unknown>).state).toBe("succeeded");
    await expect(getCodespaceExport({ accessToken: "t", codespaceName: "missing", exportId: "exp-1", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const repoMachines = await listRepoCodespaceMachines({
      accessToken: "t", owner: "acme", repo: "app",
      fetch: fetchOf({ machines: [{ name: "basicLinux32gb", display_name: "4 cores", operating_system: "linux" }] }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/acme/app/codespaces/machines");
    expect((repoMachines.machines as Array<Record<string, unknown>>)[0].name).toBe("basicLinux32gb");

    const member = await listOrgMemberCodespaces({
      accessToken: "t", org: "acme", username: "octo",
      fetch: fetchOf({ codespaces: [{ id: 7, name: "octo-app", state: "Available" }] }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/orgs/acme/members/octo/codespaces");
    expect((member.codespaces as Array<Record<string, unknown>>)[0].state).toBe("Available");

    const mineCodespaces = await listUserCodespaces({
      accessToken: "t", page: 2,
      fetch: fetchOf({ codespaces: [{ id: 8, name: "mine", state: "Available" }] }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/user/codespaces?page=2");
    expect(String(calls.at(-1))).not.toContain("/secrets");

    const orgCodespaces = await listOrgCodespaces({
      accessToken: "t", org: "acme",
      fetch: fetchOf({ codespaces: [{ id: 9, name: "org", state: "Shutdown" }] }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/orgs/acme/codespaces");
    expect((orgCodespaces.codespaces as Array<Record<string, unknown>>)[0].name).toBe("org");
    await expect(listOrgCodespaces({ accessToken: "t", org: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const machines = await listCodespaceMachines({
      accessToken: "t", codespaceName: "octo-app",
      fetch: fetchOf({ machines: [{ name: "standardLinux", display_name: "8 cores", operating_system: "linux" }] }),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/user/codespaces/octo-app/machines");
    expect((machines.machines as Array<Record<string, unknown>>)[0].os).toBe("linux");
    await expect(listCodespaceMachines({ accessToken: "t", codespaceName: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
