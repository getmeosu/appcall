import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import pagesBuildFixture from "../fixtures/pages_build.json";
import pagesBuildsFixture from "../fixtures/pages_builds.json";
import pagesDeploymentFixture from "../fixtures/pages_deployment.json";
import sarifFixture from "../fixtures/sarif_status.json";
import databasesFixture from "../fixtures/codeql_databases.json";
import orgAlertsFixture from "../fixtures/org_code_scanning_alerts.json";
import advisoryFixture from "../fixtures/global_advisory.json";
import advisoriesFixture from "../fixtures/global_advisories.json";
import {
  getRepoPagesBuild,
  getLatestRepoPagesBuild,
  getRepoPagesDeployment,
  listRepoPagesBuilds,
  getCodeScanningSarif,
  listCodeqlDatabases,
  listOrgCodeScanningAlerts,
  getGlobalAdvisory,
  listGlobalAdvisories,
} from "../src/actions";
import {
  validateGetPagesBuildInput,
  validateGetPagesDeploymentInput,
  validateListPagesBuildsInput,
  validateGetSarifUploadInput,
  validateListCodeqlDatabasesInput,
  validateListOrgCodeScanningAlertsInput,
  validateGetGlobalAdvisoryInput,
  validateListGlobalAdvisoriesInput,
} from "../src/card16_reads";

const READS = [
  "repos.pages.builds.get",
  "repos.pages.builds.latest.get",
  "repos.pages.deployments.get",
  "repos.pages.builds.list",
  "code_scanning.sarifs.get",
  "code_scanning.codeql.databases.list",
  "orgs.code_scanning.alerts.list",
  "advisories.get",
  "advisories.list",
] as const;

describe("github card-16 reads", () => {
  test("manifest stays v0.64.0 at 656 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.64.0");
    expect(Object.keys(manifest.operations).length).toBe(656);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    expect(manifest.operations["code_scanning.alerts.list"]).toBeDefined();
    expect(manifest.operations["code_scanning.alerts.get"]).toBeDefined();
    expect(manifest.operations["repos.security_advisories.get"]).toBeDefined();
    expect(manifest.operations["repos.security_advisories.list"]).toBeDefined();
    expect(manifest.operations["classroom"]).toBeUndefined();
  });

  test("validates path fields, documented pagination, and rejects excluded routes' params", () => {
    expect(validateGetPagesBuildInput({ owner: "octocat", repo: "Hello-World", buildId: 4 })).toEqual({
      owner: "octocat", repo: "Hello-World", buildId: 4,
    });
    expect(() => validateGetPagesBuildInput({ owner: "octo/cat", repo: "Hello-World", buildId: 4 })).toThrow(/owner/);
    expect(() => validateGetPagesBuildInput({ owner: "octocat", repo: "Hello-World", buildId: 0 })).toThrow(/buildId/);
    expect(validateGetPagesDeploymentInput({
      owner: "octocat", repo: "Hello-World", pagesDeploymentId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }).pagesDeploymentId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(validateGetPagesDeploymentInput({ owner: "octocat", repo: "Hello-World", pagesDeploymentId: 9 }).pagesDeploymentId).toBe("9");
    expect(() => validateGetPagesDeploymentInput({ owner: "octocat", repo: "Hello-World", pagesDeploymentId: "a/b" })).toThrow(/pagesDeploymentId/);
    expect(validateListPagesBuildsInput({ owner: "octocat", repo: "Hello-World", perPage: 30, page: 2 })).toEqual({
      owner: "octocat", repo: "Hello-World", perPage: 30, page: 2,
    });
    expect(() => validateListPagesBuildsInput({ owner: "octocat", repo: "Hello-World", perPage: 101 })).toThrow(/perPage/);
    expect(validateGetSarifUploadInput({ owner: "octocat", repo: "Hello-World", sarifId: "sarif-1" }).sarifId).toBe("sarif-1");
    expect(() => validateGetSarifUploadInput({ owner: "octocat", repo: "Hello-World", sarifId: "a/b" })).toThrow(/sarifId/);
    expect(validateListCodeqlDatabasesInput({ owner: "octocat", repo: "Hello-World" })).toEqual({ owner: "octocat", repo: "Hello-World" });
    expect(validateListOrgCodeScanningAlertsInput({
      org: "octocat", state: "open", severity: "high", perPage: 10, page: 2, sort: "created", direction: "desc",
    })).toMatchObject({ org: "octocat", state: "open", severity: "high", perPage: 10, page: 2 });
    expect(() => validateListOrgCodeScanningAlertsInput({ org: "octocat", toolName: "CodeQL", toolGuid: "guid" })).toThrow(/toolName and toolGuid/);
    expect(() => validateListOrgCodeScanningAlertsInput({ org: "octo/cat" })).toThrow(/org/);
    expect(validateGetGlobalAdvisoryInput({ ghsaId: "GHSA-abcd-efgh-ijkl" }).ghsaId).toBe("GHSA-abcd-efgh-ijkl");
    expect(() => validateGetGlobalAdvisoryInput({ ghsaId: "not-a-ghsa" })).toThrow(/ghsaId/);
    const listed = validateListGlobalAdvisoriesInput({ perPage: 10, ecosystem: "npm", severity: "low", page: 2 });
    expect(listed.perPage).toBe(10);
    expect(listed).not.toHaveProperty("page");
    expect(() => validateListGlobalAdvisoriesInput({ perPage: 101 })).toThrow(/perPage/);
  });

  test("gets a Pages build, the latest build, a deployment, and lists builds", async () => {
    const build = await getRepoPagesBuild({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      buildId: 4,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/pages/builds/4");
        expect(String(input)).not.toMatch(/\/pages$/);
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(pagesBuildFixture), { status: 200 });
      },
    });
    expect(build.action).toBe("repos.pages.builds.get");
    expect(build.build).toMatchObject({ status: "built", commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", duration: 10 });

    const latest = await getLatestRepoPagesBuild({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octocat/Hello-World/pages/builds/latest");
        return new Response(JSON.stringify(pagesBuildFixture), { status: 200 });
      },
    });
    expect(latest.action).toBe("repos.pages.builds.latest.get");

    const deployment = await getRepoPagesDeployment({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      pagesDeploymentId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/pages/deployments/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(pagesDeploymentFixture), { status: 200 });
      },
    });
    expect(deployment.action).toBe("repos.pages.deployments.get");
    expect(deployment.deployment).toMatchObject({ status: "succeed" });

    const listed = await listRepoPagesBuilds({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      perPage: 30,
      page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octocat/Hello-World/pages/builds?per_page=30&page=2");
        return new Response(JSON.stringify(pagesBuildsFixture), { status: 200 });
      },
    });
    expect(listed.action).toBe("repos.pages.builds.list");
    expect((listed.builds as { status: string }[])[0].status).toBe("built");

    await expect(getRepoPagesBuild({
      accessToken: "t", owner: "octocat", repo: "Hello-World", buildId: 1,
      fetch: async () => new Response(null, { status: 204 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("gets a SARIF upload and lists CodeQL databases without a language segment", async () => {
    const sarif = await getCodeScanningSarif({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      sarifId: "sarif-1",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/code-scanning/sarifs/sarif-1");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(sarifFixture), { status: 200 });
      },
    });
    expect(sarif.action).toBe("code_scanning.sarifs.get");
    expect(sarif.sarif).toMatchObject({ processingStatus: "complete" });

    const databases = await listCodeqlDatabases({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async (input) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/repos/octocat/Hello-World/code-scanning/codeql/databases");
        expect(url).not.toMatch(/\/databases\/[^/]+/);
        return new Response(JSON.stringify(databasesFixture), { status: 200 });
      },
    });
    expect(databases.action).toBe("code_scanning.codeql.databases.list");
    expect((databases.databases as { language: string; name: string }[])[0]).toMatchObject({ language: "javascript", name: "javascript" });
  });

  test("lists organization code scanning alerts, not repository alerts", async () => {
    const result = await listOrgCodeScanningAlerts({
      accessToken: "t",
      org: "octo cat",
      toolName: "CodeQL",
      state: "open",
      severity: "high",
      perPage: 10,
      page: 2,
      sort: "updated",
      direction: "asc",
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/orgs/octo%20cat/code-scanning/alerts?tool_name=CodeQL&per_page=10&page=2&direction=asc&state=open&sort=updated&severity=high");
        expect(url).not.toContain("/repos/");
        expect(url).not.toContain("ref=");
        expect(url).not.toContain("pr=");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(orgAlertsFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("orgs.code_scanning.alerts.list");
    expect((result.alerts as { number: number; repository: string; ruleId: string }[])[0]).toMatchObject({
      number: 1, repository: "octocat/Hello-World", ruleId: "js/example",
    });
  });

  test("gets and lists global advisories, not repository advisories", async () => {
    const one = await getGlobalAdvisory({
      accessToken: "t",
      ghsaId: "GHSA-abcd-efgh-ijkl",
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/advisories/GHSA-abcd-efgh-ijkl");
        expect(url).not.toContain("/repos/");
        expect(url).not.toContain("/security-advisories/");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(advisoryFixture), { status: 200 });
      },
    });
    expect(one.action).toBe("advisories.get");
    expect(one.advisory).toMatchObject({ ghsaId: "GHSA-abcd-efgh-ijkl", cveId: "CVE-2020-0001", severity: "low" });

    const listed = await listGlobalAdvisories({
      accessToken: "t",
      ecosystem: "npm",
      severity: "low",
      perPage: 10,
      sort: "published",
      direction: "desc",
      page: 4,
      fetch: async (input) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/advisories?ecosystem=npm&severity=low&direction=desc&per_page=10&sort=published");
        expect(url).not.toMatch(/[?&]page=/);
        expect(url).not.toContain("/repos/");
        return new Response(JSON.stringify(advisoriesFixture), { status: 200 });
      },
    });
    expect(listed.action).toBe("advisories.list");
    expect((listed.advisories as { ghsaId: string }[])[0].ghsaId).toBe("GHSA-abcd-efgh-ijkl");
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getRepoPagesBuild({
      accessToken: "t", owner: "octocat", repo: "Hello-World", buildId: 1,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = () => new Response("{}", { status: 404 });
    await expect(getRepoPagesBuild({ accessToken: "t", owner: "octocat", repo: "Hello-World", buildId: 1, fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getLatestRepoPagesBuild({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getRepoPagesDeployment({ accessToken: "t", owner: "octocat", repo: "Hello-World", pagesDeploymentId: "1", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoPagesBuilds({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getCodeScanningSarif({ accessToken: "t", owner: "octocat", repo: "Hello-World", sarifId: "sarif-1", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listCodeqlDatabases({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgCodeScanningAlerts({ accessToken: "t", org: "octocat", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getGlobalAdvisory({ accessToken: "t", ghsaId: "GHSA-abcd-efgh-ijkl", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listGlobalAdvisories({ accessToken: "t", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = getRepoPagesBuild({ owner: "octocat", repo: "Hello-World", buildId: 4 });
    expect(result.action).toBe("repos.pages.builds.get");
    expect(result.validated).toEqual({ owner: "octocat", repo: "Hello-World", buildId: 4 });
  });
});
