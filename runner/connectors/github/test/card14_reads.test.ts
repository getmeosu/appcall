import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getGitignoreTemplate,
  getLicense,
  getZen,
} from "../src/actions";
import {
  validateGetGitignoreTemplateInput,
  validateGetLicenseInput,
  validateGetZenInput,
} from "../src/card14_reads";

const READS = [
  "meta.zen.get",
  "licenses.get",
  "gitignore.templates.get",
] as const;

const licenseBody = {
  key: "mit",
  name: "MIT License",
  spdx_id: "MIT",
  url: "https://api.github.com/licenses/mit",
  node_id: "MDc6TGljZW5zZW1pdA==",
  html_url: "http://choosealicense.com/licenses/mit/",
  description: "A short and simple permissive license.",
  implementation: "Create a text file.",
  permissions: ["commercial-use", "modifications"],
  conditions: ["include-copyright"],
  limitations: ["liability"],
  body: "MIT License text",
  featured: true,
  extra: "drop-me",
};

const gitignoreBody = {
  name: "Node",
  source: "node_modules/\n",
  extra: "drop-me",
};

describe("github card14 zen license and gitignore reads", () => {
  test("version stays 0.74.0 and the three reads omit effect fields", () => {
    expect(manifest.version).toBe("0.74.0");
    expect(READS).toHaveLength(3);
    expect(Object.keys(manifest.operations)).toHaveLength(756);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["meta.zen.get"].description).toContain("GET /zen");
    expect(manifest.operations["licenses.get"].description).toContain("GET /licenses/{license}");
    expect(manifest.operations["gitignore.templates.get"].description).toContain("GET /gitignore/templates/{name}");
    expect(manifest.operations["repos.license.get"]).toBeDefined();
    expect(manifest.operations["licenses.list"]).toBeDefined();
    expect(manifest.operations["gitignore.templates.list"]).toBeDefined();
  });

  test("reads the documented paths with the bearer token", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer t");
      expect(headers.Accept).toBe("application/vnd.github+json");
      if (url.endsWith("/zen")) return new Response("Responsive is better than fast.", { status: 200, headers: { "content-type": "text/plain" } });
      if (url.endsWith("/licenses/mit")) return json(licenseBody);
      if (url.endsWith("/gitignore/templates/Node")) return json(gitignoreBody);
      return new Response("{}", { status: 500 });
    };
    const zen = await getZen({ accessToken: "t", fetch });
    expect(zen.text).toBe("Responsive is better than fast.");
    const license = await getLicense({ accessToken: "t", fetch, license: "mit" });
    expect(license.license).toEqual({
      key: "mit",
      name: "MIT License",
      spdxId: "MIT",
      url: "https://api.github.com/licenses/mit",
      nodeId: "MDc6TGljZW5zZW1pdA==",
      htmlUrl: "http://choosealicense.com/licenses/mit/",
      description: "A short and simple permissive license.",
      implementation: "Create a text file.",
      permissions: ["commercial-use", "modifications"],
      conditions: ["include-copyright"],
      limitations: ["liability"],
      body: "MIT License text",
      featured: true,
    });
    expect(JSON.stringify(license.license)).not.toContain("drop-me");
    const template = await getGitignoreTemplate({ accessToken: "t", fetch, name: "Node" });
    expect(template.template).toEqual({ name: "Node", source: "node_modules/\n" });
    expect(JSON.stringify(template.template)).not.toContain("drop-me");
    expect(seen).toEqual([
      "https://api.github.com/zen",
      "https://api.github.com/licenses/mit",
      "https://api.github.com/gitignore/templates/Node",
    ]);
  });

  test("a normal 404 is CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = async () => new Response("", { status: 404 });
    const denied = async () => new Response("", { status: 401 });
    await expect(getZen({ accessToken: "t", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getLicense({ accessToken: "t", license: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getGitignoreTemplate({ accessToken: "t", name: "missing", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getLicense({ accessToken: "t", license: "mit", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch and path segments stay single", () => {
    expect(validateGetZenInput({})).toEqual({});
    expect(validateGetZenInput(undefined)).toEqual({});
    expect(validateGetLicenseInput({ license: "mit" })).toEqual({ license: "mit" });
    expect(() => validateGetLicenseInput({})).toThrow(/license is required/);
    expect(() => validateGetLicenseInput({ license: "a/b" })).toThrow(/single path segment/);
    expect(validateGetGitignoreTemplateInput({ name: "Node" })).toEqual({ name: "Node" });
    expect(() => validateGetGitignoreTemplateInput({ name: "a/b" })).toThrow(/single path segment/);
    const validated = getLicense({ license: "mit" });
    expect(validated.validated).toEqual({ license: "mit" });
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
