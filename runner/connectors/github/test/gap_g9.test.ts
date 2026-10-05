import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  checkUserStarred,
  deleteUserInteractionLimits,
  deleteAuthenticatedUserPackage,
  disablePrivateVulnerabilityReporting,
  enablePrivateVulnerabilityReporting,
  listOrgIssues,
  listOrgPackageVersions,
  listRepoAttestations,
  listAuthenticatedUserPackageVersions,
  removeOrgPublicMember,
  updatePagesSite,
  uploadCodeScanningSarif,
} from "../src/actions";
import {
  validateUpdatePagesSiteInput,
  validateUploadCodeScanningSarifInput,
  validateDeleteUserPackageInput,
} from "../src/gap_g9";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write"; reconcile?: string }> = {
  "repos.pages.update": { methodPath: "PUT /repos/{owner}/{repo}/pages", sideEffect: "write", reconcile: "repos.pages.get" },
  "repos.private_vulnerability_reporting.enable": {
    methodPath: "PUT /repos/{owner}/{repo}/private-vulnerability-reporting",
    sideEffect: "write",
    reconcile: "repos.private_vulnerability_reporting.get",
  },
  "repos.private_vulnerability_reporting.disable": {
    methodPath: "DELETE /repos/{owner}/{repo}/private-vulnerability-reporting",
    sideEffect: "write",
    reconcile: "repos.private_vulnerability_reporting.get",
  },
  "code_scanning.sarifs.upload": { methodPath: "POST /repos/{owner}/{repo}/code-scanning/sarifs", sideEffect: "write" },
  "repos.attestations.list": { methodPath: "GET /repos/{owner}/{repo}/attestations/{subject_digest}", sideEffect: "read" },
  "orgs.issues.list": { methodPath: "GET /orgs/{org}/issues", sideEffect: "read" },
  "orgs.packages.versions.list": { methodPath: "GET /orgs/{org}/packages/{package_type}/{package_name}/versions", sideEffect: "read" },
  "orgs.public_members.remove": {
    methodPath: "DELETE /orgs/{org}/public_members/{username}",
    sideEffect: "write",
    reconcile: "orgs.public_members.check",
  },
  "user.interaction_limits.delete": { methodPath: "DELETE /user/interaction-limits", sideEffect: "write" },
  "user.starred.check": { methodPath: "GET /user/starred/{owner}/{repo}", sideEffect: "read" },
  "user.packages.delete": { methodPath: "DELETE /user/packages/{package_type}/{package_name}", sideEffect: "write" },
  "user.packages.versions.list": { methodPath: "GET /user/packages/{package_type}/{package_name}/versions", sideEffect: "read" },
};

type Seen = { url: string; method: string; body?: string };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
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

describe("github gap G9 pages vuln SARIF leftovers", () => {
  test("version is 0.76.0 at 782 ops with the read/write breakdown", () => {
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
  });

  test("the twelve G9 ops wire effects and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(12);
    let reconciles = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      if (meta.reconcile) {
        expect(op.effectPolicy).toBe("Reconcile");
        expect(op.reconcile).toBe(meta.reconcile);
        reconciles += 1;
      } else {
        expect(op.effectPolicy).toBeUndefined();
        expect(op.reconcile).toBeUndefined();
      }
    }
    expect(reconciles).toBe(4);
  });

  test("validators enforce pages source, SARIF required fields, and package types", () => {
    expect(validateUpdatePagesSiteInput({
      owner: "o", repo: "r", buildType: "workflow", source: { branch: "main", path: "/docs" },
    })).toMatchObject({ buildType: "workflow", source: { branch: "main", path: "/docs" } });
    expect(() => validateUpdatePagesSiteInput({
      owner: "o", repo: "r", source: { branch: "main", path: "/src" },
    })).toThrow(/source.path/);
    expect(validateUploadCodeScanningSarifInput({
      owner: "o", repo: "r", commitSha: "abc", ref: "refs/heads/main", sarif: "e30=",
    })).toMatchObject({ commitSha: "abc", sarif: "e30=" });
    expect(validateDeleteUserPackageInput({ packageType: "npm", packageName: "@scope/pkg" }))
      .toEqual({ packageType: "npm", packageName: "@scope/pkg" });
    expect(() => validateDeleteUserPackageInput({ packageType: "zip", packageName: "x" })).toThrow(/packageType/);
  });

  test("pages/vuln/public_members wire; SARIF 202; DELETE 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const pages = recorder([empty(204)]);
    expect(await updatePagesSite({
      accessToken: "t", fetch: pages.fetch, owner: "o", repo: "r",
      cname: "ex.com", httpsEnforced: true, buildType: "legacy", source: { branch: "gh-pages", path: "/" },
    })).toMatchObject({ updated: true });
    expect(JSON.parse(pages.seen[0].body!)).toEqual({
      cname: "ex.com", https_enforced: true, build_type: "legacy", source: { branch: "gh-pages", path: "/" },
    });

    const en = recorder([empty(204)]);
    expect(await enablePrivateVulnerabilityReporting({ accessToken: "t", fetch: en.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ enabled: true });
    expect(en.seen[0].method).toBe("PUT");

    const dis = recorder([empty(204)]);
    expect(await disablePrivateVulnerabilityReporting({ accessToken: "t", fetch: dis.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ enabled: false });
    expect(dis.seen[0].method).toBe("DELETE");

    const sarif = recorder([json({ id: "sid", url: "https://api.github.com/x" }, 202)]);
    expect(await uploadCodeScanningSarif({
      accessToken: "t", fetch: sarif.fetch, owner: "o", repo: "r",
      commitSha: "abc", ref: "refs/heads/main", sarif: "e30=",
    })).toMatchObject({ upload: { id: "sid" } });

    const hide = recorder([empty(204)]);
    await removeOrgPublicMember({ accessToken: "t", fetch: hide.fetch, org: "octo", username: "u" });
    expect(hide.seen[0].method).toBe("DELETE");

    const missing = recorder([empty(404)]);
    await expect(deleteAuthenticatedUserPackage({
      accessToken: "t", fetch: missing.fetch, packageType: "npm", packageName: "gone",
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("reads: attestations, issues, package versions, starred check 204/404", async () => {
    const att = recorder([json({ attestations: [{ repository_id: 1, bundle_url: "u", bundle: { a: 1 } }] })]);
    expect(await listRepoAttestations({
      accessToken: "t", fetch: att.fetch, owner: "o", repo: "r", subjectDigest: "sha256:abc",
    })).toMatchObject({ attestations: [{ repositoryId: 1, bundleUrl: "u" }] });

    const issues = recorder([json([{ id: 1, number: 2, title: "t", state: "open", html_url: "h" }])]);
    expect(await listOrgIssues({ accessToken: "t", fetch: issues.fetch, org: "octo", state: "open" }))
      .toMatchObject({ issues: [{ id: 1, number: 2, title: "t" }] });
    expect(issues.seen[0].url).toContain("state=open");

    const orgVers = recorder([json([{ id: 9, name: "1.0.0", created_at: "a" }])]);
    expect(await listOrgPackageVersions({
      accessToken: "t", fetch: orgVers.fetch, org: "octo", packageType: "npm", packageName: "pkg",
    })).toMatchObject({ versions: [{ id: 9, name: "1.0.0" }] });

    const userVers = recorder([json([{ id: 3, name: "2.0.0", created_at: "b" }])]);
    expect(await listAuthenticatedUserPackageVersions({
      accessToken: "t", fetch: userVers.fetch, packageType: "npm", packageName: "pkg", state: "active",
    })).toMatchObject({ versions: [{ id: 3, name: "2.0.0" }] });

    const starred = recorder([empty(204)]);
    expect(await checkUserStarred({ accessToken: "t", fetch: starred.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ starred: true });
    const unstarred = recorder([empty(404)]);
    expect(await checkUserStarred({ accessToken: "t", fetch: unstarred.fetch, owner: "o", repo: "r" }))
      .toMatchObject({ starred: false });

    expect(await deleteUserInteractionLimits({ accessToken: "t", fetch: recorder([empty(204)]).fetch }))
      .toMatchObject({ deleted: true });
  });
});
