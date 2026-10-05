import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getMetaRoot,
  getRepoDependencyGraphSbom,
  getCodeqlDatabase,
  getCodeScanningDefaultSetup,
  getOrgPropertySchema,
  getOrgProjectItem,
  getRepoPagesHealth,
  getRepoPages,
  getUserProjectItem,
  listRepoIssueTypes,
  listOrgProjects,
  listUserProjectItems,
  listUserProjectViewItems,
  listUserProjects,
} from "../src/actions";
import { validateGetCodeqlDatabaseInput, validateListRepoIssueTypesInput } from "../src/card19_reads";

const READS = [
  "meta.root.get",
  "repos.dependency_graph.sbom.get",
  "code_scanning.codeql.databases.get",
  "code_scanning.default_setup.get",
  "orgs.properties.schema.get",
  "orgs.projects_v2.items.get",
  "repos.pages.health.get",
  "repos.pages.get",
  "users.projects_v2.items.get",
  "repos.issue_types.list",
  "orgs.projects_v2.list",
  "users.projects_v2.items.list",
  "users.projects_v2.views.items.list",
  "users.projects_v2.list",
] as const;

const PATHS: Record<(typeof READS)[number], string> = {
  "meta.root.get": "GET /",
  "repos.dependency_graph.sbom.get": "GET /repos/{owner}/{repo}/dependency-graph/sbom",
  "code_scanning.codeql.databases.get": "GET /repos/{owner}/{repo}/code-scanning/codeql/databases/{language}",
  "code_scanning.default_setup.get": "GET /repos/{owner}/{repo}/code-scanning/default-setup",
  "orgs.properties.schema.get": "GET /orgs/{org}/properties/schema/{custom_property_name}",
  "orgs.projects_v2.items.get": "GET /orgs/{org}/projectsV2/{project_number}/items/{item_id}",
  "repos.pages.health.get": "GET /repos/{owner}/{repo}/pages/health",
  "repos.pages.get": "GET /repos/{owner}/{repo}/pages",
  "users.projects_v2.items.get": "GET /users/{username}/projectsV2/{project_number}/items/{item_id}",
  "repos.issue_types.list": "GET /repos/{owner}/{repo}/issue-types",
  "orgs.projects_v2.list": "GET /orgs/{org}/projectsV2",
  "users.projects_v2.items.list": "GET /users/{username}/projectsV2/{project_number}/items",
  "users.projects_v2.views.items.list": "GET /users/{username}/projectsV2/{project_number}/views/{view_number}/items",
  "users.projects_v2.list": "GET /users/{username}/projectsV2",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github card-19 reads", () => {
  test("version stays 0.72.0 at 731 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.72.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops).length).toBe(731);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    for (const op of Object.values(ops)) kinds[op.kind as keyof typeof kinds] += 1;
    expect(kinds).toEqual({ action: 681, sync: 4, webhook: 46 });
    for (const key of READS) {
      const op = ops[key];
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    expect(ops["emojis.get"]).toBeDefined();
    expect(ops["feeds.get"]).toBeDefined();
    expect(ops["meta.get"]).toBeDefined();
    expect(ops["meta.versions.list"]).toBeDefined();
    expect(ops["meta.octocat.get"]).toBeDefined();
    expect(ops["repos.tarball.get"]).toBeDefined();
    expect(ops["repos.zipball.get"]).toBeDefined();
    expect(ops["meta.zen.get"]).toBeDefined();
    expect(ops["licenses.get"]).toBeDefined();
    expect(ops["gitignore.templates.get"]).toBeDefined();
    expect(String(ops["meta.root.get"].description)).not.toContain("GET /meta");
    expect(ops["app.installations.list"]).toBeUndefined();
    expect(ops["classroom"]).toBeUndefined();
  });

  test("rejects a slash in a path segment", () => {
    expect(() => validateGetCodeqlDatabaseInput({ owner: "octo/cat", repo: "Hello-World", language: "javascript" })).toThrow(/owner/);
    expect(() => validateListRepoIssueTypesInput({ owner: "octocat", repo: "Hello-World", perPage: 101 })).toThrow(/perPage/);
  });

  test("200 returns the upstream body and 404 stays upstream", async () => {
    const calls: string[] = [];
    const fetchOf = (response: Response) => async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return response;
    };
    const missing = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json({ message: "Not Found" }, 404);
    };
    const token = "not-a-token";

    const rootBody = { current_user_url: "https://api.github.com/user" };
    const root = await getMetaRoot({ accessToken: token, fetch: fetchOf(json(rootBody)) });
    expect(calls.at(-1)).toBe("https://api.github.com/");
    expect(root.root).toEqual(rootBody);
    await expect(getMetaRoot({ accessToken: token, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const sbomBody = { sbom: { SPDXID: "SPDXRef-DOCUMENT" } };
    const sbom = await getRepoDependencyGraphSbom({
      accessToken: token, owner: "octo cat", repo: "Hello World", fetch: fetchOf(json(sbomBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/dependency-graph/sbom");
    expect(sbom.sbom).toEqual(sbomBody);
    await expect(getRepoDependencyGraphSbom({ accessToken: token, owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const setupBody = { state: "configured" };
    const setup = await getCodeScanningDefaultSetup({
      accessToken: token, owner: "octocat", repo: "Hello-World", fetch: fetchOf(json(setupBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/octocat/Hello-World/code-scanning/default-setup");
    expect(setup.setup).toEqual(setupBody);
    await expect(getCodeScanningDefaultSetup({ accessToken: token, owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const propertyBody = { property_name: "team", value_type: "string" };
    const property = await getOrgPropertySchema({
      accessToken: token, org: "octo cat", customPropertyName: "team name", fetch: fetchOf(json(propertyBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/orgs/octo%20cat/properties/schema/team%20name");
    expect(property.property).toEqual(propertyBody);
    await expect(getOrgPropertySchema({ accessToken: token, org: "octocat", customPropertyName: "team", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const orgItemBody = { id: 7, content_type: "Issue" };
    const orgItem = await getOrgProjectItem({
      accessToken: token, org: "octocat", projectNumber: 4, itemId: 7, fetch: fetchOf(json(orgItemBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/orgs/octocat/projectsV2/4/items/7");
    expect(orgItem.item).toEqual(orgItemBody);
    await expect(getOrgProjectItem({ accessToken: token, org: "octocat", projectNumber: 4, itemId: 7, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const healthBody = { domain: { host: "example.github.io", state: "ok" } };
    const health = await getRepoPagesHealth({
      accessToken: token, owner: "octocat", repo: "Hello-World", fetch: fetchOf(json(healthBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/octocat/Hello-World/pages/health");
    expect(health.health).toEqual(healthBody);
    await expect(getRepoPagesHealth({ accessToken: token, owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const pagesBody = { url: "https://api.github.com/repos/octocat/Hello-World/pages", status: "built" };
    const pages = await getRepoPages({
      accessToken: token, owner: "octocat", repo: "Hello-World", fetch: fetchOf(json(pagesBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/octocat/Hello-World/pages");
    expect(pages.pages).toEqual(pagesBody);
    await expect(getRepoPages({ accessToken: token, owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const userItemBody = { id: 9, content_type: "DraftIssue" };
    const userItem = await getUserProjectItem({
      accessToken: token, username: "octo cat", projectNumber: 3, itemId: 9, fetch: fetchOf(json(userItemBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octo%20cat/projectsV2/3/items/9");
    expect(userItem.item).toEqual(userItemBody);
    await expect(getUserProjectItem({ accessToken: token, username: "octocat", projectNumber: 3, itemId: 9, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const typesBody = [{ id: 1, name: "Bug" }];
    const types = await listRepoIssueTypes({
      accessToken: token, owner: "octocat", repo: "Hello-World", perPage: 30, page: 2, fetch: fetchOf(json(typesBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/repos/octocat/Hello-World/issue-types?per_page=30&page=2");
    expect(types.issueTypes).toEqual(typesBody);
    await expect(listRepoIssueTypes({ accessToken: token, owner: "octocat", repo: "Hello-World", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const orgProjectsBody = [{ id: 1, number: 4, title: "Roadmap" }];
    const orgProjects = await listOrgProjects({
      accessToken: token, org: "octocat", fetch: fetchOf(json(orgProjectsBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/orgs/octocat/projectsV2");
    expect(orgProjects.projects).toEqual(orgProjectsBody);
    await expect(listOrgProjects({ accessToken: token, org: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const userItemsBody = [{ id: 9 }];
    const userItems = await listUserProjectItems({
      accessToken: token, username: "octocat", projectNumber: 3, page: 2, fetch: fetchOf(json(userItemsBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octocat/projectsV2/3/items?page=2");
    expect(userItems.items).toEqual(userItemsBody);
    await expect(listUserProjectItems({ accessToken: token, username: "octocat", projectNumber: 3, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const viewItemsBody = [{ id: 9 }];
    const viewItems = await listUserProjectViewItems({
      accessToken: token, username: "octocat", projectNumber: 3, viewNumber: 1, fetch: fetchOf(json(viewItemsBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octocat/projectsV2/3/views/1/items");
    expect(viewItems.items).toEqual(viewItemsBody);
    await expect(listUserProjectViewItems({ accessToken: token, username: "octocat", projectNumber: 3, viewNumber: 1, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const userProjectsBody = [{ id: 2, number: 3, title: "Personal" }];
    const userProjects = await listUserProjects({
      accessToken: token, username: "octocat", fetch: fetchOf(json(userProjectsBody)),
    });
    expect(calls.at(-1)).toBe("https://api.github.com/users/octocat/projectsV2");
    expect(userProjects.projects).toEqual(userProjectsBody);
    await expect(listUserProjects({ accessToken: token, username: "octocat", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("codeql database get returns the 302 Location and does not follow or return bytes", async () => {
    const calls: string[] = [];
    const fetchRedirect = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push(`${init?.method ?? "GET"} ${String(input)} redirect=${init?.redirect} accept=${headers?.Accept}`);
      return new Response("archive-bytes-must-not-leak", {
        status: 302,
        headers: { Location: "https://codeload.github.com/octocat/Hello-World/codeql/javascript" },
      });
    };
    const result = await getCodeqlDatabase({
      accessToken: "not-a-token", owner: "octocat", repo: "Hello-World", language: "java script", fetch: fetchRedirect,
    });
    expect(calls).toEqual([
      "GET https://api.github.com/repos/octocat/Hello-World/code-scanning/codeql/databases/java%20script redirect=manual accept=application/zip",
    ]);
    expect(result.downloadUrl).toBe("https://codeload.github.com/octocat/Hello-World/codeql/javascript");
    expect(JSON.stringify(result)).not.toContain("archive-bytes-must-not-leak");

    const bare = async () => new Response("archive-bytes-must-not-leak", { status: 302 });
    await expect(getCodeqlDatabase({
      accessToken: "not-a-token", owner: "octocat", repo: "Hello-World", language: "javascript", fetch: bare,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const missing = async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    await expect(getCodeqlDatabase({
      accessToken: "not-a-token", owner: "octocat", repo: "Hello-World", language: "javascript", fetch: missing,
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
