import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteAuthenticatedPackageVersion,
  deleteOrgPackageVersion,
  deleteUserPackageVersion,
  restoreOrgPackage,
  restoreUserPackage,
  restoreAuthenticatedPackage,
} from "../src/actions";

const PATHS = {
  "user.packages.versions.delete": "DELETE /user/packages/{package_type}/{package_name}/versions/{package_version_id}",
  "orgs.packages.versions.delete": "DELETE /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}",
  "users.packages.versions.delete": "DELETE /users/{username}/packages/{package_type}/{package_name}/versions/{package_version_id}",
  "orgs.packages.restore": "POST /orgs/{org}/packages/{package_type}/{package_name}/restore",
  "users.packages.restore": "POST /users/{username}/packages/{package_type}/{package_name}/restore",
  "user.packages.restore": "POST /user/packages/{package_type}/{package_name}/restore",
} as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 8 package version deletes and package restores", () => {
  test("version is 0.76.0 at 782 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.76.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(782);
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
    expect(kinds).toEqual({ action: 732, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 388, write: 329, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      const props = (op.inputSchema as { properties: Record<string, unknown> }).properties;
      expect(props.token).toBeUndefined();
    }
    for (const key of ["orgs.packages.restore", "users.packages.restore", "user.packages.restore"]) {
      expect(String(ops[key].description)).toContain("no versions/{package_version_id} segment");
      expect(String(ops[key].description)).not.toContain("/versions/{package_version_id}/restore");
    }
    expect(ops["classroom"]).toBeUndefined();
    expect(ops["installation.token.delete"]).toBeUndefined();
  });

  test("deletes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      return empty(status);
    };

    const auth = await deleteAuthenticatedPackageVersion({
      accessToken: token, packageType: "npm", packageName: "app", packageVersionId: 9, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/packages/npm/app/versions/9 ");
    expect(auth).toMatchObject({
      action: "user.packages.versions.delete", deleted: true, packageType: "npm", packageName: "app", packageVersionId: 9,
    });
    await expect(deleteAuthenticatedPackageVersion({
      accessToken: token, packageType: "npm", packageName: "app", packageVersionId: 9, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const org = await deleteOrgPackageVersion({
      accessToken: token, org: "octo cat", packageType: "container", packageName: "acme/app", packageVersionId: 3, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/orgs/octo%20cat/packages/container/acme%2Fapp/versions/3 ");
    expect(org).toMatchObject({
      action: "orgs.packages.versions.delete", deleted: true, org: "octo cat", packageType: "container", packageName: "acme/app", packageVersionId: 3,
    });
    await expect(deleteOrgPackageVersion({
      accessToken: token, org: "acme", packageType: "npm", packageName: "app", packageVersionId: 3, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const user = await deleteUserPackageVersion({
      accessToken: token, username: "octo", packageType: "maven", packageName: "lib", packageVersionId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/users/octo/packages/maven/lib/versions/7 ");
    expect(user).toMatchObject({
      action: "users.packages.versions.delete", deleted: true, username: "octo", packageType: "maven", packageName: "lib", packageVersionId: 7,
    });
    await expect(deleteUserPackageVersion({
      accessToken: token, username: "octo", packageType: "maven", packageName: "lib", packageVersionId: 7, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("restores post without a versions segment and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      return empty(status);
    };

    const org = await restoreOrgPackage({
      accessToken: token, org: "acme", packageType: "npm", packageName: "app", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/orgs/acme/packages/npm/app/restore ");
    expect(String(calls.at(-1))).not.toContain("/versions/");
    expect(org).toMatchObject({ action: "orgs.packages.restore", restored: true, org: "acme", packageType: "npm", packageName: "app" });
    await expect(restoreOrgPackage({
      accessToken: token, org: "acme", packageType: "npm", packageName: "app", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const user = await restoreUserPackage({
      accessToken: token, username: "octo", packageType: "container", packageName: "acme/app", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/users/octo/packages/container/acme%2Fapp/restore ");
    expect(String(calls.at(-1))).not.toContain("/versions/");
    expect(user).toMatchObject({
      action: "users.packages.restore", restored: true, username: "octo", packageType: "container", packageName: "acme/app",
    });
    await expect(restoreUserPackage({
      accessToken: token, username: "octo", packageType: "npm", packageName: "app", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const auth = await restoreAuthenticatedPackage({
      accessToken: token, packageType: "nuget", packageName: "pkg", fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/user/packages/nuget/pkg/restore ");
    expect(String(calls.at(-1))).not.toContain("/versions/");
    expect(auth).toMatchObject({ action: "user.packages.restore", restored: true, packageType: "nuget", packageName: "pkg" });
    await expect(restoreAuthenticatedPackage({
      accessToken: token, packageType: "nuget", packageName: "pkg", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
